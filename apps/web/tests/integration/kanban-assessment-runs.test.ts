import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { users } from '@rgtools/db/schema'
import { workOrders, workOrderItems, workOrderEvents, workOrderAssessmentRuns as runs, workOrderAssessmentWork as work } from '@rgtools/db/schema-workorders'
import { createAssessmentRunRepository } from '@/modules/kanban/assessment-run-store'
import { createAssessmentStore } from '@/modules/kanban/assessment-store'
import { createAssessmentRunService, runSnapshot, type RunVersions } from '@/modules/kanban/assessment-runs'
import { ASSESSMENT_RULES, type AssessmentJob, type StoredAssessment } from '@/modules/kanban/assessment'
import { ASSESSMENT_SOURCE_POLICY, assessmentSnapshotHash } from '@/modules/kanban/assessment-source'
import { validateOperationalAssessmentOutput } from '@/modules/kanban/operational-assessment'
import { unknownFields } from '@/modules/kanban/__tests__/operational-fixtures'

const url = process.env.RG406_TEST_DATABASE_URL
const enabled = Boolean(url && new URL(url).hostname === '127.0.0.1' && new URL(url).pathname === '/rg406')
const actor = crypto.randomUUID(), executor = crypto.randomUUID(), jobId = crypto.randomUUID(), itemId = crypto.randomUUID()
const versions: RunVersions = { rules: ASSESSMENT_RULES, schema: 1, sourcePolicy: ASSESSMENT_SOURCE_POLICY, model: 'synthetic' }
const failed = { assessedProducts: 0, reusedProducts: 0, pendingJobs: 0, failedJobs: 1, unavailable: false }
let pool: Pool, database: ReturnType<typeof drizzle>, repo: ReturnType<typeof createAssessmentRunRepository>, assessments: ReturnType<typeof createAssessmentStore>
let ids: string[] = []
describe.skipIf(!enabled)('durable assessment claims on named disposable localhost database', () => {
  beforeAll(async () => {
    neonConfig.webSocketConstructor = WebSocket; neonConfig.wsProxy = () => '127.0.0.1:55441'; neonConfig.useSecureWebSocket = false; neonConfig.pipelineConnect = false
    pool = new Pool({ connectionString: url! }); database = drizzle(pool); repo = createAssessmentRunRepository(database); assessments = createAssessmentStore(database)
    await database.insert(users).values([actor, executor].map(id => ({ id, username: `rg407-runs-${id}`, passwordHash: 'not-a-login-hash', role: 'staff' as const })))
  })
  beforeEach(async () => {
    if (ids.length) await database.delete(runs).where(inArray(runs.id, ids)); ids = []
    await database.delete(workOrders).where(eq(workOrders.id, jobId))
    await database.insert(workOrders).values({ id: jobId, identityKind: 'servicem8_uuid', identityValue: jobId, servicem8JobUuid: jobId, servicem8Status: 'Work Order', clientName: 'Synthetic', jobDescription: 'Synthetic', lastServiceM8SyncedAt: new Date('2026-11-18T00:00:00Z') })
    await database.insert(workOrderItems).values({ id: itemId, workOrderId: jobId, servicem8JobUuid: jobId, servicem8ItemUuid: itemId, originalDescription: 'Shower', quantity: '1' })
  })
  afterAll(async () => {
    if (!database) return
    if (ids.length) await database.delete(runs).where(inArray(runs.id, ids))
    await database.delete(workOrders).where(eq(workOrders.id, jobId)); await database.delete(users).where(inArray(users.id, [actor, executor])); await pool.end()
  })
  const inventory = async () => (await assessments.list()).filter(job => job.id === jobId)
  async function start(jobs?: AssessmentJob[]) {
    const source = jobs ?? await inventory(), run = await repo.ensure(source, runSnapshot(source, versions), actor, versions)
    ids.push(run.id); return { run, jobs: source }
  }
  function values(job: AssessmentJob, hash: string): Record<string, StoredAssessment> {
    return { [job.items[0].id]: { state: 'complete', sourceHash: hash, snapshotHash: assessmentSnapshotHash(job.description, 'Shower'), sourceGeneration: job.sourceGeneration, rules: ASSESSMENT_RULES, model: 'synthetic', checkedAt: '2026-11-18T01:00:00Z', assessedAt: '2026-11-18T01:00:00Z', error: null,
      result: { status: 'unknown', date: null, kind: 'unknown', reason: 'No dated evidence.', evidence: [] }, operational: validateOperationalAssessmentOutput({ results: [{ item: 'p0', fields: unknownFields() }] }, { items: [{ token: 'p0', text: 'Shower' }], sources: [] })[0] } }
  }
  it.each([-3_600_000, 3_600_000])('keeps a valid 120-second lease despite application clock skew of %ims', async skew => {
    const { run, jobs } = await start(), realNow = Date.now.bind(Date)
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew)
    try {
      const [claimed] = await repo.claim(run.id, executor, 1, jobs)
      const remaining = await database.execute(sql`select extract(epoch from (lease_expires_at - clock_timestamp())) as seconds from work_order_assessment_work where id = ${claimed.claim.workId}`)
      expect(Number(remaining.rows[0].seconds)).toBeGreaterThan(110)
      expect(Number(remaining.rows[0].seconds)).toBeLessThanOrEqual(120)
      expect(await assessments.save({ ...jobs[0], claim: claimed.claim }, values(jobs[0], 'clock-safe'), executor)).toBe(true)
      expect(await repo.status(run.id)).toMatchObject({ state: 'complete', pendingJobs: 0, assessedProducts: 1 })
    } finally { clock.mockRestore() }
  })
  it.each([-3_600_000, 3_600_000])('keeps a five-second retry delay despite application clock skew of %ims', async skew => {
    const { run, jobs } = await start(), [claimed] = await repo.claim(run.id, executor, 1, jobs)
    const realNow = Date.now.bind(Date), clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew)
    try {
      await repo.finish(claimed.claim, failed)
      const remaining = await database.execute(sql`select extract(epoch from (available_at - clock_timestamp())) as seconds from work_order_assessment_work where id = ${claimed.claim.workId}`)
      expect(Number(remaining.rows[0].seconds)).toBeGreaterThan(0)
      expect(Number(remaining.rows[0].seconds)).toBeLessThanOrEqual(5)
      expect(await repo.claim(run.id, executor, 1, jobs)).toHaveLength(0)
      await database.update(work).set({ availableAt: sql`clock_timestamp() - interval '1 second'` }).where(eq(work.id, claimed.claim.workId))
      expect(await repo.claim(run.id, executor, 1, jobs)).toHaveLength(1)
    } finally { clock.mockRestore() }
  })
  it('rejects stale lease publication and history after expiry/reclaim; atomically publishes for the real executor', async () => {
    const { run, jobs } = await start(), [a] = await repo.claim(run.id, actor, 1, jobs)
    await database.update(work).set({ leaseExpiresAt: new Date(0) }).where(eq(work.id, a.claim.workId))
    expect(await assessments.save({ ...jobs[0], claim: a.claim }, values(jobs[0], 'expired-A'), actor)).toBe(false)
    const [b] = await repo.claim(run.id, executor, 1, jobs)
    expect(b.claim.token).not.toBe(a.claim.token)
    expect(await assessments.save({ ...jobs[0], claim: a.claim }, values(jobs[0], 'late-A'), actor)).toBe(false)
    expect((await inventory())[0].items[0].stored).toBeNull()
    expect(await database.select().from(workOrderEvents).where(eq(workOrderEvents.workOrderItemId, itemId))).toHaveLength(0)
    expect(await assessments.save({ ...jobs[0], claim: b.claim }, values(jobs[0], 'current-B'), actor)).toBe(false)
    expect(await assessments.save({ ...jobs[0], claim: b.claim }, values(jobs[0], 'current-B'), executor)).toBe(true)
    expect(await repo.status(run.id)).toMatchObject({ requesterId: actor, state: 'complete', completedJobs: 1, pendingJobs: 0, assessedProducts: 1 })
    const events = await database.select().from(workOrderEvents).where(eq(workOrderEvents.workOrderItemId, itemId))
    expect(events).toHaveLength(1); expect(events[0].actorId).toBe(executor)
  })
  it('claims a job atomically across simultaneous workers and survives repository restart', async () => {
    const { run, jobs } = await start()
    const results = await Promise.all([repo.claim(run.id, actor, 1, jobs), createAssessmentRunRepository(database).claim(run.id, executor, 1, jobs)])
    expect(results.flat()).toHaveLength(1)
    expect(await createAssessmentRunRepository(database).status(run.id)).toMatchObject({ state: 'active', pendingJobs: 1, completedJobs: 0 })
  })
  it('persists bounded retries and exhausts expired attempts without reporting early completion', async () => {
    const { run, jobs } = await start()
    for (let attempt = 0; attempt < 3; attempt++) {
      const [claimed] = await repo.claim(run.id, executor, 1, jobs)
      await repo.finish(claimed.claim, failed)
      expect(await repo.status(run.id)).toMatchObject(attempt < 2 ? { state: 'active', pendingJobs: 1, completedJobs: 0 } : { state: 'needs_retry', pendingJobs: 0, completedJobs: 1, failedJobs: 1 })
      await database.update(work).set({ availableAt: new Date(0) }).where(eq(work.runId, run.id))
    }
    expect(await repo.claim(run.id, executor, 1, jobs)).toHaveLength(0)
    expect((await database.select().from(work).where(eq(work.runId, run.id)))[0]).toMatchObject({ attempts: 3, state: 'needs_retry' })
  })
  it('keeps same-current work and supersedes a changed generation, refusing the old active claim', async () => {
    const { run, jobs } = await start(), [old] = await repo.claim(run.id, actor, 1, jobs)
    expect((await repo.ensure(jobs, runSnapshot(jobs, versions), executor, versions)).id).toBe(run.id)
    await database.update(workOrders).set({ lastServiceM8SyncedAt: new Date('2026-11-18T02:00:00Z') }).where(eq(workOrders.id, jobId))
    const fresh = await start()
    expect(fresh.run.id).not.toBe(run.id)
    expect(await repo.status(run.id)).toMatchObject({ state: 'superseded', pendingJobs: 0, completedJobs: 1, totalJobs: 1 })
    expect(await assessments.save({ ...jobs[0], claim: old.claim }, values(jobs[0], 'old-generation'), actor)).toBe(false)
  })
  it('retains captured denominator after physical deletion and reaches a terminal replacement run', async () => {
    const { run } = await start()
    await database.delete(workOrders).where(eq(workOrders.id, jobId))
    const service = createAssessmentRunService({ repository: repo, inventory, sync: async () => { throw new Error('Must not sync on continuation') }, withSourceLock: async operation => operation(), model: 'synthetic', assess: async () => failed })
    const next = await service.continue(run.id, executor); ids.push(next.id)
    expect(next).toMatchObject({ state: 'complete', totalJobs: 0, pendingJobs: 0 })
    expect(await repo.status(run.id)).toMatchObject({ state: 'superseded', totalJobs: 1, completedJobs: 1, pendingJobs: 0 })
    expect(await database.select().from(work).where(and(eq(work.runId, run.id), eq(work.workOrderId, jobId)))).toHaveLength(1)
  })
  it('makes no-product jobs explicitly unavailable and terminal without losing the job', async () => {
    await database.update(workOrderItems).set({ isActive: false }).where(eq(workOrderItems.id, itemId))
    const { run, jobs } = await start()
    expect(jobs).toHaveLength(1); expect(jobs[0].items).toEqual([])
    expect(run).toMatchObject({ state: 'complete', totalJobs: 1, unavailableJobs: 1, pendingJobs: 0, completedJobs: 1 })
    expect((await database.select().from(work).where(eq(work.runId, run.id)))[0].state).toBe('unavailable')
    await database.update(workOrders).set({ servicem8JobUuid: null }).where(eq(workOrders.id, jobId))
    const missingIdentity = await start()
    expect(missingIdentity.jobs[0].sourceId).toBe('')
    expect(missingIdentity.run).toMatchObject({ totalJobs: 1, unavailableJobs: 1, completedJobs: 1, pendingJobs: 0 })
  })
  it('finishes multiple durable batches from one source sync using actual assessment publication', async () => {
    const additional = [crypto.randomUUID(), crypto.randomUUID()], wanted = [jobId, ...additional]
    await database.insert(workOrders).values(additional.map(id => ({ id, identityKind: 'servicem8_uuid', identityValue: id, servicem8JobUuid: id, servicem8Status: 'Work Order', clientName: 'Synthetic', jobDescription: 'Synthetic', lastServiceM8SyncedAt: new Date('2026-11-18T00:00:00Z') })))
    await database.insert(workOrderItems).values(additional.map(id => ({ workOrderId: id, servicem8JobUuid: id, servicem8ItemUuid: id, originalDescription: 'Shower', quantity: '1' })))
    try {
      let syncs = 0
      const service = createAssessmentRunService({ repository: repo, inventory: async () => (await assessments.list()).filter(job => wanted.includes(job.id)), sync: async () => { syncs++ }, withSourceLock: async operation => operation(), model: 'synthetic', batchSize: 2,
        assess: async (job, actorId) => ({ assessedProducts: await assessments.save(job, values(job, 'validated'), actorId) ? 1 : 0, reusedProducts: 0, pendingJobs: 0, failedJobs: 0, unavailable: false }) })
      const run = await service.start(actor); ids.push(run.id)
      expect(await service.continue(run.id, executor)).toMatchObject({ state: 'active', completedJobs: 2, pendingJobs: 1 })
      expect(await service.continue(run.id, executor)).toMatchObject({ state: 'complete', completedJobs: 3, pendingJobs: 0, assessedProducts: 3, reviewProducts: 3 })
      expect(syncs).toBe(1)
    } finally { await database.delete(workOrders).where(inArray(workOrders.id, additional)) }
  })
})
