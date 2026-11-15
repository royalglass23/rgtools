import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { eq } from 'drizzle-orm'
import { users } from '@rgtools/db/schema'
import { workOrders, workOrderItems, workOrderEvents } from '@rgtools/db/schema-workorders'
import { persistProductOperations } from '@/modules/kanban/persistence'
import { parseManualState } from '@/modules/kanban/work-orders'

// Deliberately independent of DATABASE_URL: test setup loads .env.local with override=true.
const url = process.env.RG406_TEST_DATABASE_URL
const enabled = Boolean(url && new URL(url).hostname === '127.0.0.1' && new URL(url).pathname === '/rg406')
neonConfig.webSocketConstructor = WebSocket
let pool: Pool
const actorId = crypto.randomUUID(), jobId = crypto.randomUUID(), itemId = crypto.randomUUID()
let database: ReturnType<typeof drizzle>
describe.skipIf(!enabled)('dashboard manual-state ownership on isolated localhost DB', () => {
  beforeAll(async () => {
    neonConfig.wsProxy = () => '127.0.0.1:55441'; neonConfig.useSecureWebSocket = false; neonConfig.pipelineConnect = false
    pool = new Pool({ connectionString: url! }); database = drizzle(pool)
    await database.insert(users).values({ id: actorId, username: `rg406-${actorId}`, passwordHash: 'not-a-login-hash', role: 'staff' })
    await database.insert(workOrders).values({ id: jobId, identityKind: 'servicem8_uuid', identityValue: jobId, servicem8JobUuid: jobId, servicem8Status: 'Work Order', clientName: 'Test job' })
    await database.insert(workOrderItems).values({ id: itemId, workOrderId: jobId, servicem8JobUuid: jobId, servicem8ItemUuid: itemId, quantity: '1', originalDescription: 'Test shower' })
  })
  afterAll(async () => {
    if (!database) return
    await database.delete(workOrders).where(eq(workOrders.id, jobId)); await database.delete(users).where(eq(users.id, actorId)); await pool.end()
  })
  it('saves canonical dates, readiness and history atomically; rejects stale edits', async () => {
    const manual = { ...parseManualState({}), siteReady: 'yes' as const, notes: 'Staff inspection' }
    const input = { id: itemId, revision: 0, installerId: null, expectedInstallerId: null, expectedInstallDate: null, installDate: '2026-11-20', manual }
    expect(await persistProductOperations(input, actorId, database)).toEqual({ revision: 1 })
    const [item] = await database.select().from(workOrderItems).where(eq(workOrderItems.id, itemId))
    expect(item.installDate).toBe('2026-11-20'); expect(item.dashboardState.siteReady).toBe('yes')
    await expect(persistProductOperations(input, actorId, database)).rejects.toThrow('Someone changed')
    const events = await database.select().from(workOrderEvents).where(eq(workOrderEvents.workOrderItemId, itemId))
    expect(events).toHaveLength(1); expect(events[0].actorId).toBe(actorId)
    await database.update(workOrderItems).set({ originalDescription: 'Renamed source', sortOrder: 4, updatedAt: new Date() }).where(eq(workOrderItems.id, itemId))
    await persistProductOperations({ ...input, revision: 1, expectedInstallDate: '2026-11-20', manual: { ...manual, notes: '' } }, actorId, database)
    const [cleared] = await database.select().from(workOrderItems).where(eq(workOrderItems.id, itemId))
    expect(cleared.dashboardState.notes).toBe(''); expect(cleared.originalDescription).toBe('Renamed source')
    await database.update(workOrderItems).set({ isActive: false }).where(eq(workOrderItems.id, itemId))
    await expect(persistProductOperations({ ...input, revision: 2, expectedInstallDate: '2026-11-20' }, actorId, database)).rejects.toThrow('removed')
  })
})
