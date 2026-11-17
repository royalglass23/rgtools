import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { eq } from 'drizzle-orm'
import { users } from '@rgtools/db/schema'
import { workOrders, workOrderItems, workOrderEvents, workOrderInstallers } from '@rgtools/db/schema-workorders'
import { createAssessmentStore } from '@/modules/kanban/assessment-store'
import { ASSESSMENT_RULES, type AssessmentJob, type StoredAssessment } from '@/modules/kanban/assessment'
import { ASSESSMENT_SOURCE_POLICY, assessmentInstallerVersion, assessmentSnapshotHash } from '@/modules/kanban/assessment-source'
import { validateOperationalAssessmentOutput } from '@/modules/kanban/operational-assessment'
import { automaticDashboardState, applyFieldPatches } from '@/modules/kanban/field-ownership'
import { readWorkOrderDashboard } from '@/modules/kanban/persistence'
import { unknownFields } from '@/modules/kanban/__tests__/operational-fixtures'

const url = process.env.RG406_TEST_DATABASE_URL
const enabled = Boolean(url && new URL(url).hostname === '127.0.0.1' && new URL(url).pathname === '/rg406')
neonConfig.webSocketConstructor = WebSocket
const actor = crypto.randomUUID(), jobId = crypto.randomUUID(), itemId = crypto.randomUUID()
let pool: Pool, database: ReturnType<typeof drizzle>, store: ReturnType<typeof createAssessmentStore>
const generation = new Date('2026-11-17T00:00:00Z')
describe.skipIf(!enabled)('operational assessment persistence on the named synthetic localhost database', () => {
  beforeAll(async () => {
    neonConfig.wsProxy = () => '127.0.0.1:55441'; neonConfig.useSecureWebSocket = false; neonConfig.pipelineConnect = false
    pool = new Pool({ connectionString: url! }); database = drizzle(pool); store = createAssessmentStore(database)
    await database.insert(users).values({ id: actor, username: `rg407-${actor}`, passwordHash: 'not-a-login-hash', role: 'staff' })
    await database.insert(workOrders).values({ id: jobId, identityKind: 'servicem8_uuid', identityValue: jobId, jobNumber: jobId, servicem8JobUuid: jobId, servicem8Status: 'Work Order', clientName: 'Synthetic', jobDescription: 'Synthetic job', lastServiceM8SyncedAt: generation })
    await database.insert(workOrderItems).values({ id: itemId, workOrderId: jobId, servicem8JobUuid: jobId, servicem8ItemUuid: itemId, quantity: '1', originalDescription: 'Shower' })
  })
  beforeEach(async () => {
    await database.delete(workOrderEvents).where(eq(workOrderEvents.workOrderItemId, itemId))
    await database.update(workOrders).set({ lastServiceM8SyncedAt: generation }).where(eq(workOrders.id, jobId))
    const staff = applyFieldPatches(automaticDashboardState(), { installDate: null, installerId: null }, { installDate: { mode: 'staff', value: null }, notes: { mode: 'staff', value: 'Preserve staff Notes' } })
    await database.update(workOrderItems).set({ originalDescription: 'Shower', dashboardState: staff.dashboardState, dashboardRevision: 3, dashboardAssessment: {}, installDate: null, installerId: null }).where(eq(workOrderItems.id, itemId))
  })
  afterAll(async () => {
    if (!database) return
    await database.delete(workOrders).where(eq(workOrders.id, jobId)); await database.delete(users).where(eq(users.id, actor)); await pool.end()
  })
  const load = async () => (await store.list()).find(job => job.id === jobId)!
  function values(job: AssessmentJob, hash: string): Record<string, StoredAssessment> {
    const operational = validateOperationalAssessmentOutput({ results: [{ item: 'p0', fields: unknownFields() }] }, { items: [{ token: 'p0', text: 'Shower' }], sources: [] })[0]
    return { [itemId]: { state: 'complete', sourceHash: hash, snapshotHash: assessmentSnapshotHash(job.description, 'Shower'), sourceGeneration: job.sourceGeneration, installerVersion: assessmentInstallerVersion(job.installers ?? []), sourcePolicy: ASSESSMENT_SOURCE_POLICY, rules: ASSESSMENT_RULES, model: 'synthetic', checkedAt: '2026-11-17T01:00:00Z', assessedAt: '2026-11-17T01:00:00Z', error: null, operational, result: { status: 'dated', date: '2026-11-20', kind: 'installation', reason: 'Synthetic validated date.', evidence: [{ kind: 'note', reference: null, observedAt: '2026-11-17', quote: 'Shower installation is 20/11/2026.' }] } } }
  }
  it('writes assessments only and retains staff Notes, ownership, deliberate date clear and revision', async () => {
    const job = await load()
    expect(await store.save(job, values(job, 'new-source'), actor)).toBe(true)
    const row = (await readWorkOrderDashboard(jobId, database)).rows[0]
    expect(row.revision).toBe(3); expect(row.manual.notes).toBe('Preserve staff Notes')
    expect(row.ownership.installDate).toBe('staff'); expect(row.planningDate).toBeNull(); expect(row.installerId).toBeNull()
    expect(row.assessment?.operational?.version).toBe(1)
    expect(row.operationalCurrent).toBe(true)
  })
  it('rejects an older worker after another assessment saved in the same source generation', async () => {
    const earlier = await load(), later = await load()
    expect(await store.save(later, values(later, 'newer-prepared-source'), actor)).toBe(true)
    expect(await store.save(earlier, values(earlier, 'older-prepared-source'), actor)).toBe(false)
    expect((await readWorkOrderDashboard(jobId, database)).rows[0].assessment?.sourceHash).toBe('newer-prepared-source')
  })
  it('rejects a worker after the local source-sync generation changes', async () => {
    const job = await load()
    await database.update(workOrders).set({ lastServiceM8SyncedAt: new Date('2026-11-17T02:00:00Z') }).where(eq(workOrders.id, jobId))
    expect(await store.save(job, values(job, 'stale-generation'), actor)).toBe(false)
  })
  it('rejects changed active installer inventory and product snapshots', async () => {
    const job = await load(), installerId = crypto.randomUUID()
    await database.insert(workOrderInstallers).values({ id: installerId, displayName: 'Synthetic new installer', normalizedName: `rg407-${installerId}` })
    try { expect(await store.save(job, values(job, 'stale-installers'), actor)).toBe(false) }
    finally { await database.delete(workOrderInstallers).where(eq(workOrderInstallers.id, installerId)) }
    await database.update(workOrderItems).set({ originalDescription: 'Changed shower' }).where(eq(workOrderItems.id, itemId))
    expect(await store.save(job, values(job, 'stale-product'), actor)).toBe(false)
  })
  it('does not add history for an unchanged assessment check and marks changed installer coverage stale', async () => {
    const first = await load(); await store.save(first, values(first, 'unchanged-source'), actor)
    const checked = await load(), next = values(checked, 'unchanged-source'); next[itemId].checkedAt = '2026-11-17T01:05:00Z'
    expect(await store.save(checked, next, actor)).toBe(true)
    expect(await database.select().from(workOrderEvents).where(eq(workOrderEvents.workOrderItemId, itemId))).toHaveLength(1)
    const installerId = crypto.randomUUID()
    await database.insert(workOrderInstallers).values({ id: installerId, displayName: 'Another synthetic installer', normalizedName: `rg407-${installerId}` })
    try { expect((await readWorkOrderDashboard(jobId, database)).rows[0].operationalCurrent).toBe(false) }
    finally { await database.delete(workOrderInstallers).where(eq(workOrderInstallers.id, installerId)) }
  })
})
