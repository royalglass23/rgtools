import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { eq } from 'drizzle-orm'
import { users } from '@rgtools/db/schema'
import { workOrders, workOrderItems } from '@rgtools/db/schema-workorders'
import { automaticDashboardState } from '@/modules/kanban/field-ownership'
import { persistProductOperations, readWorkOrderDashboard } from '@/modules/kanban/persistence'
import { effectiveProductFields } from '@/modules/kanban/effective-fields'
import { assessmentInstallerVersion, assessmentSnapshotHash, ASSESSMENT_SOURCE_POLICY } from '@/modules/kanban/assessment-source'
import { effectiveProduct } from '@/modules/kanban/__tests__/effective-fixtures'

const url = process.env.RG406_TEST_DATABASE_URL
const enabled = Boolean(url && new URL(url).hostname === '127.0.0.1' && new URL(url).pathname === '/rg406')
const actor = crypto.randomUUID(), jobId = crypto.randomUUID(), itemId = crypto.randomUUID()
let pool: Pool, database: ReturnType<typeof drizzle>
describe.skipIf(!enabled)('effective field read model on the named disposable database', () => {
  beforeAll(async () => {
    neonConfig.webSocketConstructor = WebSocket; neonConfig.wsProxy = () => '127.0.0.1:55441'; neonConfig.useSecureWebSocket = false; neonConfig.pipelineConnect = false
    pool = new Pool({ connectionString: url! }); database = drizzle(pool)
    await database.insert(users).values({ id: actor, username: `effective-${actor}`, passwordHash: 'not-a-login-hash', role: 'staff' })
    await database.insert(workOrders).values({ id: jobId, identityKind: 'servicem8_uuid', identityValue: jobId, servicem8JobUuid: jobId, servicem8Status: 'Work Order', clientName: 'Synthetic effective fields', jobDescription: 'Synthetic', lastServiceM8SyncedAt: new Date('2026-11-18T00:00:00Z') })
    const { installers } = await readWorkOrderDashboard('', database)
    const assessment = effectiveProduct().assessment!
    assessment.sourceGeneration = '2026-11-18T00:00:00.000Z'; assessment.sourcePolicy = ASSESSMENT_SOURCE_POLICY; assessment.installerVersion = assessmentInstallerVersion(installers); assessment.snapshotHash = assessmentSnapshotHash('Synthetic', 'Shower')
    await database.insert(workOrderItems).values({ id: itemId, workOrderId: jobId, servicem8ItemUuid: itemId, servicem8JobUuid: jobId, originalDescription: 'Shower', quantity: '1', dashboardState: automaticDashboardState(), dashboardAssessment: assessment })
  })
  afterAll(async () => {
    if (!database) return
    await database.delete(workOrders).where(eq(workOrders.id, jobId)); await database.delete(users).where(eq(users.id, actor)); await pool.end()
  })
  const load = async () => (await readWorkOrderDashboard('', database)).rows.find(row => row.itemId === itemId)!
  it('keeps automatic fields current after a Notes-only save and preserves canonical clears', async () => {
    const before = await load()
    expect(effectiveProductFields(before).fields.buildingConsent.value).toBe('approved')
    expect(effectiveProductFields(before).fields.siteReady.value).toBe('yes')
    await persistProductOperations({ id: itemId, revision: before.revision, expectedInstallerId: null, expectedInstallDate: null, patches: { notes: { mode: 'staff', value: 'Staff inspection only' }, installDate: { mode: 'staff', value: null } } }, actor, database)
    const saved = await load(), effective = effectiveProductFields(saved)
    expect(saved.ownership.siteReady).toBe('auto'); expect(saved.ownership.notes).toBe('staff')
    expect(effective.fields.siteReady.value).toBe('yes'); expect(effective.fields.notes.value).toBe('Staff inspection only')
    expect(effective.fields.installDate).toMatchObject({ value: null, origin: 'Staff' })
    expect(saved.installDate).toBeNull(); expect(saved.installerId).toBeNull()
    expect(effective.fields.buildingConsentNumber.value).toBe('BCO1234567')
  })
  it('reloads readiness date/purpose and explicit Unknown, then releases just that composite field', async () => {
    const before = await load()
    await persistProductOperations({ id: itemId, revision: before.revision, expectedInstallerId: null, expectedInstallDate: null, patches: { siteReady: { mode: 'staff', value: { state: 'unknown', date: '2026-11-25', datePurpose: 'expected' } } } }, actor, database)
    const saved = await load()
    expect(effectiveProductFields(saved).fields.siteReady).toMatchObject({ value: 'unknown', origin: 'Staff', date: '2026-11-25', datePurpose: 'expected' })
    await persistProductOperations({ id: itemId, revision: saved.revision, expectedInstallerId: null, expectedInstallDate: null, patches: { siteReady: { mode: 'auto' } } }, actor, database)
    const released = await load()
    expect(effectiveProductFields(released).fields.siteReady).toMatchObject({ value: 'yes', origin: 'Auto', date: '2026-11-18', datePurpose: 'ready' })
    expect(released.ownership.notes).toBe('staff'); expect(released.ownership.installDate).toBe('staff')
    await expect(persistProductOperations({ id: itemId, revision: before.revision, expectedInstallerId: null, expectedInstallDate: null, patches: { notes: { mode: 'staff', value: 'Stale input' } } }, actor, database)).rejects.toThrow('Someone changed this product')
    expect((await load()).manual.notes).toBe('Staff inspection only')
  })
})
