import { createHash } from 'node:crypto'
import { ASSESSMENT_RULES, type AssessmentJob } from './assessment'
import { ASSESSMENT_SOURCE_POLICY, assessmentInstallerVersion } from './assessment-source'
import { OPERATIONAL_SCHEMA } from './operational-assessment'
import type { AssessmentSummary } from './assessment-refresh'

export type AssessmentClaim = { runId: string; workId: string; token: string; executorId: string }
export type RunVersions = { rules: string; model: string; schema: number; sourcePolicy: string }
export type RunProgress = RunVersions & {
  id: string; snapshot: string; requesterId: string | null; state: 'active' | 'complete' | 'needs_retry' | 'superseded';
  totalJobs: number; completedJobs: number; pendingJobs: number; failedJobs: number; unavailableJobs: number;
  assessedProducts: number; reusedProducts: number; reviewProducts: number;
  sourceSyncedAt: string | null; completedAt: string | null; reason: string | null;
}
export type AssessmentRunRepository = {
  current(): Promise<RunProgress | null>;
  ensure(jobs: AssessmentJob[], snapshot: string, actorId: string, versions: RunVersions): Promise<RunProgress>;
  claim(runId: string, actorId: string, limit: number, jobs: AssessmentJob[]): Promise<Array<{ job: AssessmentJob; claim: AssessmentClaim }>>;
  finish(claim: AssessmentClaim, outcome: AssessmentSummary): Promise<void>;
  status(runId?: string): Promise<RunProgress | null>;
}
export function runSnapshot(jobs: AssessmentJob[], versions: RunVersions) {
  return createHash('sha256').update(JSON.stringify({ versions, jobs: [...jobs].sort((a, b) => a.id.localeCompare(b.id)).map(job => ({ id: job.id, sourceId: job.sourceId, description: job.description, generation: job.sourceGeneration ?? null, installers: assessmentInstallerVersion(job.installers ?? []), items: job.items.map(item => [item.id, item.description]).sort((a, b) => a[0].localeCompare(b[0])) })) })).digest('hex')
}
export function createAssessmentRunService(deps: {
  repository: AssessmentRunRepository; inventory: () => Promise<AssessmentJob[]>; sync: (actorId: string) => Promise<void>;
  withSourceLock: <T>(operation: () => Promise<T>) => Promise<T>;
  assess: (job: AssessmentJob, actorId: string, claim: AssessmentClaim) => Promise<AssessmentSummary>;
  model: string; batchSize?: number;
}) {
  const versions: RunVersions = { rules: ASSESSMENT_RULES, model: deps.model, schema: OPERATIONAL_SCHEMA, sourcePolicy: ASSESSMENT_SOURCE_POLICY }
  const batchSize = Math.max(1, Math.min(4, deps.batchSize ?? 2))
  return {
    async start(actorId: string): Promise<RunProgress> {
      return deps.withSourceLock(async () => {
        const current = await deps.repository.current()
        if (current?.state === 'active') {
          const jobs = await deps.inventory()
          return deps.repository.ensure(jobs, runSnapshot(jobs, versions), actorId, versions)
        }
        await deps.sync(actorId)
        const jobs = await deps.inventory()
        return deps.repository.ensure(jobs, runSnapshot(jobs, versions), actorId, versions)
      })
    },
    async continue(runId: string, actorId: string): Promise<RunProgress> {
      return deps.withSourceLock(async () => {
        const current = await deps.repository.status(runId)
        if (!current) throw new Error('Assessment run no longer exists. Refresh to start again.')
        if (current.state !== 'active') return current
        const jobs = await deps.inventory()
        const run = await deps.repository.ensure(jobs, runSnapshot(jobs, versions), actorId, versions)
        if (run.id !== runId) return run
        const claims = await deps.repository.claim(run.id, actorId, batchSize, jobs)
        // Every started job settles before the shared source lease is released.
        // The production adapters bound each source/provider operation separately.
        await Promise.allSettled(claims.map(async ({ job, claim }) => {
          let outcome: AssessmentSummary
          try { outcome = await deps.assess({ ...job, claim }, actorId, claim) }
          catch { outcome = { assessedProducts: 0, reusedProducts: 0, failedJobs: 1, pendingJobs: 0, unavailable: true } }
          await deps.repository.finish(claim, outcome)
        }))
        return (await deps.repository.status(run.id))!
      })
    },
    status: (runId?: string) => deps.repository.status(runId),
  }
}
