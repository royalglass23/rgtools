import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { eq } from 'drizzle-orm'
import { users } from '@rgtools/db/schema'
import { workOrders, workOrderItems, workOrderEvents, workOrderInstallers } from '@rgtools/db/schema-workorders'
import { persistProductOperations, readWorkOrderDashboard } from '@/modules/kanban/persistence'
import { automaticDashboardState } from '@/modules/kanban/field-ownership'
import { persistCanonicalStaffField } from '@/modules/work-orders/canonical-field-write'

// Deliberately independent of DATABASE_URL: test setup loads .env.local with override=true.
const url = process.env.RG406_TEST_DATABASE_URL
const enabled = Boolean(url && new URL(url).hostname === '127.0.0.1' && new URL(url).pathname === '/rg406')
neonConfig.webSocketConstructor = WebSocket
let pool: Pool
const actorId = crypto.randomUUID(), jobId = crypto.randomUUID(), itemId = crypto.randomUUID(), installerId = crypto.randomUUID()
let database: ReturnType<typeof drizzle>
describe.skipIf(!enabled)('dashboard manual-state ownership on isolated localhost DB', () => {
  beforeAll(async () => {
    neonConfig.wsProxy = () => '127.0.0.1:55441'; neonConfig.useSecureWebSocket = false; neonConfig.pipelineConnect = false
    pool = new Pool({ connectionString: url! }); database = drizzle(pool)
    await database.insert(users).values({ id: actorId, username: `rg406-${actorId}`, passwordHash: 'not-a-login-hash', role: 'staff' })
    await database.insert(workOrderInstallers).values({ id: installerId, displayName: 'Synthetic installer', normalizedName: `synthetic-${installerId}` })
    await database.insert(workOrders).values({ id: jobId, identityKind: 'servicem8_uuid', identityValue: jobId, jobNumber: jobId, servicem8JobUuid: jobId, servicem8Status: 'Work Order', clientName: 'Test job' })
    await database.insert(workOrderItems).values({ id: itemId, workOrderId: jobId, servicem8JobUuid: jobId, servicem8ItemUuid: itemId, quantity: '1', originalDescription: 'Test shower', dashboardState: automaticDashboardState() })
  })
  beforeEach(async () => {
    await database.delete(workOrderEvents).where(eq(workOrderEvents.workOrderItemId, itemId))
    await database.update(workOrderItems).set({ isActive: true, dashboardRevision: 0, dashboardState: automaticDashboardState(), installDate: null, installerId: null }).where(eq(workOrderItems.id, itemId))
  })
  afterAll(async () => {
    if (!database) return
    await database.delete(workOrders).where(eq(workOrders.id, jobId)); await database.delete(users).where(eq(users.id, actorId)); await database.delete(workOrderInstallers).where(eq(workOrderInstallers.id, installerId)); await pool.end()
  })
  it('saves canonical dates, readiness and history atomically; rejects stale edits', async () => {
    const input = { id: itemId, revision: 0, expectedInstallerId: null, expectedInstallDate: null, patches: { installDate: { mode: 'staff' as const, value: '2026-11-20' }, siteReady: { mode: 'staff' as const, value: 'yes' as const }, notes: { mode: 'staff' as const, value: 'Staff inspection' } } }
    expect(await persistProductOperations(input, actorId, database)).toEqual({ revision: 1 })
    const [item] = await database.select().from(workOrderItems).where(eq(workOrderItems.id, itemId))
    expect(item.installDate).toBe('2026-11-20'); expect(item.dashboardState.siteReady).toBe('yes')
    await expect(persistProductOperations(input, actorId, database)).rejects.toThrow('Someone changed')
    const events = await database.select().from(workOrderEvents).where(eq(workOrderEvents.workOrderItemId, itemId))
    expect(events).toHaveLength(1); expect(events[0].actorId).toBe(actorId)
    await database.update(workOrderItems).set({ originalDescription: 'Renamed source', sortOrder: 4, updatedAt: new Date() }).where(eq(workOrderItems.id, itemId))
    await persistProductOperations({ ...input, revision: 1, expectedInstallDate: '2026-11-20', patches: { notes: { mode: 'staff', value: '' } } }, actorId, database)
    const [cleared] = await database.select().from(workOrderItems).where(eq(workOrderItems.id, itemId))
    expect(cleared.dashboardState.notes).toBe(''); expect(cleared.originalDescription).toBe('Renamed source')
    await database.update(workOrderItems).set({ isActive: false }).where(eq(workOrderItems.id, itemId))
    await expect(persistProductOperations({ ...input, revision: 2, expectedInstallDate: '2026-11-20' }, actorId, database)).rejects.toThrow('removed')
  })
  it('records same-value staff intent once without repeatedly auditing an unchanged owned value', async () => {
    const input = { id: itemId, revision: 0, expectedInstallerId: null, expectedInstallDate: null, patches: { siteReady: { mode: 'staff' as const, value: 'unknown' as const } } }
    expect(await persistProductOperations(input, actorId, database)).toEqual({ revision: 1 })
    const saved = (await readWorkOrderDashboard(jobId, database)).rows[0]
    expect(saved.ownership).toMatchObject({ siteReady: 'staff', glassReady: 'auto' })
    expect(await persistProductOperations({ ...input, revision: 1 }, actorId, database)).toEqual({ revision: 1 })
    const events = await database.select().from(workOrderEvents).where(eq(workOrderEvents.workOrderItemId, itemId))
    expect(events).toHaveLength(1)
  })
  it('shares date ownership across both writers, including equal-null intent and explicit automatic reset', async () => {
    expect(await persistCanonicalStaffField({ id: itemId, field: 'installDate', value: null, expectedValue: null, revision: 0 }, actorId, database)).toMatchObject({ revision: 1 })
    let row = (await readWorkOrderDashboard(jobId, database)).rows[0]
    expect(row.ownership.installDate).toBe('staff')
    await persistProductOperations({ id: itemId, revision: 1, expectedInstallerId: null, expectedInstallDate: null, patches: { installDate: { mode: 'auto' } } }, actorId, database)
    row = (await readWorkOrderDashboard(jobId, database)).rows[0]
    expect(row.ownership.installDate).toBe('auto')
    expect(row.installDate).toBeNull()
    await expect(persistCanonicalStaffField({ id: itemId, field: 'installDate', value: '2026-11-21', expectedValue: null, revision: 1 }, actorId, database)).rejects.toThrow('Someone changed')
  })
  it('releases populated legacy date and installer values without resurrecting them on reload', async () => {
    await database.update(workOrderItems).set({ dashboardState: { siteReady: 'unknown', notes: '' }, installDate: '2026-11-20', installerId }).where(eq(workOrderItems.id, itemId))
    let row = (await readWorkOrderDashboard(jobId, database)).rows[0]
    expect(row.ownership).toMatchObject({ installDate: 'staff', installerId: 'staff', siteReady: 'staff', notes: 'staff' })
    await persistProductOperations({ id: itemId, revision: 0, expectedInstallerId: installerId, expectedInstallDate: '2026-11-20', patches: { installDate: { mode: 'auto' }, installerId: { mode: 'auto' } } }, actorId, database)
    for (let reload = 0; reload < 2; reload++) {
      row = (await readWorkOrderDashboard(jobId, database)).rows[0]
      expect(row.installDate).toBeNull(); expect(row.installerId).toBeNull()
      expect(row.ownership).toMatchObject({ installDate: 'auto', installerId: 'auto', siteReady: 'staff', notes: 'staff' })
    }
    await persistCanonicalStaffField({ id: itemId, field: 'installDate', value: null, expectedValue: null, revision: 1 }, actorId, database)
    await persistCanonicalStaffField({ id: itemId, field: 'installerId', value: null, expectedValue: null, revision: 2 }, actorId, database)
    row = (await readWorkOrderDashboard(jobId, database)).rows[0]
    expect(row.ownership).toMatchObject({ installDate: 'staff', installerId: 'staff' })
    expect(row.revision).toBe(3)
  })
  it('rolls ownership, canonical values and revision back if the actor audit cannot be recorded', async () => {
    const missingActor = crypto.randomUUID()
    await expect(persistProductOperations({ id: itemId, revision: 0, expectedInstallerId: null, expectedInstallDate: null, patches: { installDate: { mode: 'staff', value: '2026-11-20' }, siteReady: { mode: 'staff', value: 'no' } } }, missingActor, database)).rejects.toThrow()
    await expect(persistCanonicalStaffField({ id: itemId, field: 'installerId', value: installerId, expectedValue: null, revision: 0 }, missingActor, database)).rejects.toThrow()
    const row = (await readWorkOrderDashboard(jobId, database)).rows[0]
    expect(row.revision).toBe(0); expect(row.installDate).toBeNull(); expect(row.installerId).toBeNull()
    expect(row.ownership).toMatchObject({ siteReady: 'auto', installDate: 'auto', installerId: 'auto' })
    const events = await database.select().from(workOrderEvents).where(eq(workOrderEvents.workOrderItemId, itemId))
    expect(events).toHaveLength(0)
  })
  it('allows only one concurrent revision to save and keeps another product independent', async () => {
    const otherItem = crypto.randomUUID()
    await database.insert(workOrderItems).values({ id: otherItem, workOrderId: jobId, servicem8JobUuid: jobId, servicem8ItemUuid: otherItem, quantity: '1', originalDescription: 'Another product', dashboardState: automaticDashboardState() })
    const save = (notes: string) => persistProductOperations({ id: itemId, revision: 0, expectedInstallerId: null, expectedInstallDate: null, patches: { notes: { mode: 'staff', value: notes } } }, actorId, database)
    const results = await Promise.allSettled([save('First staff draft'), save('Second staff draft')])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    const rows = (await readWorkOrderDashboard(jobId, database)).rows
    expect(rows.find(row => row.itemId === itemId)?.revision).toBe(1)
    expect(rows.find(row => row.itemId === otherItem)?.ownership.notes).toBe('auto')
    await database.delete(workOrderItems).where(eq(workOrderItems.id, otherItem))
  })
})
