import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrderAssessmentRuns as runs, workOrderAssessmentWork as work } from '@rgtools/db/schema-workorders'
import type { AssessmentJob, StoredAssessment } from './assessment'
import type { AssessmentClaim, AssessmentRunRepository, RunProgress } from './assessment-runs'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
const MAX_ATTEMPTS = 3
const LEASE_MS = 120_000
function progress(row: typeof runs.$inferSelect): RunProgress {
  return { ...row, state: row.state as RunProgress['state'], sourceSyncedAt: row.sourceSyncedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null }
}
// Lock order is always run -> work -> source job -> products. Both publication
// and recovery use this order, so expiration cannot permit an old worker write.
export async function lockAssessmentClaim(tx: Transaction, claim: AssessmentClaim) {
  const [run] = await tx.select().from(runs).where(eq(runs.id, claim.runId)).for('update')
  if (run?.state !== 'active') return null
  const [item] = await tx.select().from(work).where(and(eq(work.id, claim.workId), eq(work.runId, claim.runId))).for('update')
  if (item?.state !== 'leased' || item.leaseToken !== claim.token || item.executorId !== claim.executorId || !item.leaseExpiresAt) return null
  const valid = await tx.execute(sql`select ${item.leaseExpiresAt.toISOString()}::timestamptz > clock_timestamp() as valid`)
  if (valid.rows[0]?.valid !== true) return null
  return item
}
async function recount(tx: Transaction, runId: string) {
  const rows = await tx.select().from(work).where(eq(work.runId, runId))
  const pendingJobs = rows.filter(row => ['pending', 'leased'].includes(row.state)).length
  const failedJobs = rows.filter(row => row.state === 'needs_retry').length
  await tx.update(runs).set({ pendingJobs, completedJobs: rows.length - pendingJobs, failedJobs,
    unavailableJobs: rows.filter(row => row.state === 'unavailable').length,
    assessedProducts: rows.reduce((sum, row) => sum + row.assessedProducts, 0), reusedProducts: rows.reduce((sum, row) => sum + row.reusedProducts, 0), reviewProducts: rows.reduce((sum, row) => sum + row.reviewProducts, 0),
    state: pendingJobs ? 'active' : failedJobs ? 'needs_retry' : 'complete', completedAt: pendingJobs ? null : new Date(),
    reason: failedJobs ? 'Some evidence assessments need retry. Refresh to start another bounded attempt.' : rows.some(row => row.state === 'unavailable') ? 'Some jobs have no eligible products or assessment is unavailable.' : null, updatedAt: new Date(),
  }).where(eq(runs.id, runId))
}
export async function publishAssessmentClaim(tx: Transaction, job: AssessmentJob, values: Record<string, StoredAssessment>) {
  if (!job.claim || Object.values(values).some(value => value.state !== 'complete')) return
  const count = job.items.length
  const reviewProducts = Object.values(values).filter(value => value.result?.status === 'review' || Object.values(value.operational?.fields ?? {}).some(field => field.status !== 'assessed')).length
  await tx.update(work).set({ state: 'succeeded', leaseToken: null, leaseExpiresAt: null, reason: null, assessedProducts: job.assessmentReused ? 0 : count, reusedProducts: job.assessmentReused ? count : 0, reviewProducts, updatedAt: new Date() }).where(eq(work.id, job.claim.workId))
  await recount(tx, job.claim.runId)
}
export function createAssessmentRunRepository(database: Pick<typeof db, 'select' | 'transaction'> = db): AssessmentRunRepository {
  async function status(id?: string) {
    const query = database.select().from(runs)
    const rows = id ? await query.where(eq(runs.id, id)).limit(1) : await query.orderBy(desc(runs.createdAt), desc(runs.id)).limit(1)
    return rows[0] ? progress(rows[0]) : null
  }
  return {
    current: () => status(), status,
    async ensure(jobs, snapshot, actorId, versions) {
      return database.transaction(async tx => {
        // Also serializes empty-table creation across processes.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(407003)`)
        const [current] = await tx.select().from(runs).orderBy(desc(runs.createdAt), desc(runs.id)).limit(1).for('update')
        if (current?.state === 'active' && current.snapshot === snapshot) return progress(current)
        if (current?.state === 'active') {
          await tx.update(runs).set({ state: 'superseded', pendingJobs: 0, completedJobs: current.totalJobs, reason: 'A newer local source snapshot or assessment version superseded this run.', completedAt: new Date(), updatedAt: new Date() }).where(eq(runs.id, current.id))
          await tx.update(work).set({ state: 'superseded', leaseToken: null, leaseExpiresAt: null, reason: 'Superseded source snapshot.', updatedAt: new Date() }).where(and(eq(work.runId, current.id), sql`${work.state} in ('pending','leased')`))
        }
        const [run] = await tx.insert(runs).values({ snapshot, requesterId: actorId, ...versions, totalJobs: jobs.length, pendingJobs: jobs.filter(job => job.items.length && job.sourceId).length,
          completedJobs: jobs.filter(job => !job.items.length || !job.sourceId).length, unavailableJobs: jobs.filter(job => !job.items.length || !job.sourceId).length,
          sourceSyncedAt: jobs.reduce<Date | null>((date, job) => job.sourceGeneration && (!date || new Date(job.sourceGeneration) > date) ? new Date(job.sourceGeneration) : date, null),
          state: jobs.some(job => job.items.length && job.sourceId) ? 'active' : 'complete', completedAt: jobs.some(job => job.items.length && job.sourceId) ? null : new Date(),
          reason: jobs.length ? jobs.some(job => !job.items.length || !job.sourceId) ? 'Some jobs have no eligible products.' : null : 'No eligible Work Orders are available for assessment.',
        }).returning()
        if (jobs.length) await tx.insert(work).values(jobs.map(job => ({ runId: run.id, workOrderId: job.id, sourceGeneration: job.sourceGeneration ? new Date(job.sourceGeneration) : null,
          state: job.items.length && job.sourceId ? 'pending' : 'unavailable', reason: job.items.length && job.sourceId ? null : 'No eligible source products are available.' })))
        return progress(run)
      })
    },
    async claim(runId, actorId, limit, jobs) {
      return database.transaction(async tx => {
        const [run] = await tx.select().from(runs).where(eq(runs.id, runId)).for('update')
        if (run?.state !== 'active') return []
        const candidates = await tx.select().from(work).where(and(eq(work.runId, runId), sql`(${work.state} = 'pending' and ${work.availableAt} <= now()) or (${work.runId} = ${runId} and ${work.state} = 'leased' and ${work.leaseExpiresAt} <= now())`)).orderBy(asc(work.availableAt), asc(work.id)).limit(Math.min(4, limit)).for('update')
        const claimed: Array<{ job: AssessmentJob; claim: AssessmentClaim }> = []
        for (const row of candidates) {
          const job = jobs.find(job => job.id === row.workOrderId)
          if (!job?.items.length || !job.sourceId || row.attempts >= MAX_ATTEMPTS) {
            await tx.update(work).set({ state: !job?.items.length || !job.sourceId ? 'unavailable' : 'needs_retry', reason: !job?.items.length ? 'Captured products are no longer available.' : 'The bounded retry limit was reached.', leaseToken: null, leaseExpiresAt: null, updatedAt: new Date() }).where(eq(work.id, row.id))
            continue
          }
          const token = crypto.randomUUID()
          await tx.update(work).set({ state: 'leased', attempts: row.attempts + 1, leaseToken: token, leaseExpiresAt: sql`clock_timestamp() + (${LEASE_MS} * interval '1 millisecond')`, executorId: actorId, updatedAt: new Date() }).where(eq(work.id, row.id))
          claimed.push({ job, claim: { runId, workId: row.id, token, executorId: actorId } })
        }
        await recount(tx, runId)
        return claimed
      })
    },
    async finish(claim, outcome) {
      await database.transaction(async tx => {
        const item = await lockAssessmentClaim(tx, claim)
        if (!item) return
        const failed = Boolean(outcome.failedJobs || outcome.pendingJobs || outcome.unavailable)
        const retry = failed && item.attempts < MAX_ATTEMPTS
        await tx.update(work).set({ state: failed ? retry ? 'pending' : 'needs_retry' : 'succeeded',
          leaseToken: null, leaseExpiresAt: null, availableAt: sql`clock_timestamp() + (${retry ? 5000 * item.attempts : 0} * interval '1 millisecond')`,
          reason: failed ? retry ? 'Evidence assessment did not finish; a bounded retry is pending.' : 'Evidence assessment could not finish after three attempts. Refresh to retry.' : null,
          assessedProducts: outcome.assessedProducts, reusedProducts: outcome.reusedProducts, updatedAt: new Date(),
        }).where(eq(work.id, item.id))
        await recount(tx, claim.runId)
      })
    },
  }
}
