import type { ServiceM8FetchRequest } from '@/lib/servicem8/client'
import { ASSESSMENT_RULES, validateAssessmentOutput, type AssessmentStore, type ProviderContext, type StoredAssessment } from './assessment'
import { assessmentContextHash, assessmentSnapshotHash, loadAssessmentContext } from './assessment-source'
import { assessmentModel, generateDueAssessment } from './assessment-provider'

export type AssessmentSummary = { assessedProducts: number; reusedProducts: number; failedJobs: number; pendingJobs: number; unavailable: boolean }
export async function refreshDueAssessments(request: ServiceM8FetchRequest, actorId: string, options: {
  store?: AssessmentStore; provider?: (context: ProviderContext) => Promise<unknown>; model?: string;
  now?: () => Date; clockMs?: () => number; timeBudgetMs?: number;
} = {}): Promise<AssessmentSummary> {
  const store = options.store ?? (await import('./assessment-store')).assessmentStore
  const jobs = await store.list()
  const result: AssessmentSummary = { assessedProducts: 0, reusedProducts: 0, failedJobs: 0, pendingJobs: 0, unavailable: false }
  if (!options.provider && !process.env.OPENAI_API_KEY?.trim()) return { ...result, pendingJobs: jobs.length, unavailable: true }
  const provider = options.provider ?? generateDueAssessment, model = options.model ?? assessmentModel()
  const now = options.now ?? (() => new Date()), clock = options.clockMs ?? Date.now, started = clock()
  let index = 0
  async function worker() {
    while (index < jobs.length && clock() - started < (options.timeBudgetMs ?? 90_000)) {
      const job = jobs[index++]
      try {
        const context = await loadAssessmentContext(job, request)
        const sourceHash = assessmentContextHash(context), checkedAt = now().toISOString()
        const cached = job.items.every(item => item.stored?.state === 'complete' && item.stored.sourceHash === sourceHash && item.stored.rules === ASSESSMENT_RULES && item.stored.model === model)
        const proposals = cached ? job.items.map(item => item.stored!.result) : validateAssessmentOutput(await provider({ items: context.items, sources: context.sources.map(source => ({ token: source.token, kind: source.kind, item: source.item, observedAt: source.observedAt, text: source.text })) }), context)
        const values: Record<string, StoredAssessment> = {}
        job.items.forEach((item, i) => { values[item.id] = { state: 'complete', sourceHash, snapshotHash: assessmentSnapshotHash(job.description, item.description), rules: ASSESSMENT_RULES, model,
          checkedAt, assessedAt: cached ? item.stored!.assessedAt : checkedAt, result: proposals[i], error: null } })
        if (await store.save(job, values, actorId)) {
          if (cached) result.reusedProducts += job.items.length
          else result.assessedProducts += job.items.length
        } else result.pendingJobs++
      } catch {
        result.failedJobs++
        try { await store.fail(job, now().toISOString(), actorId) }
        catch { result.unavailable = true }
      }
    }
  }
  // Keep the shared lease until every worker has settled, even if persistence
  // of a failure itself fails. No sibling may save after this pass returns.
  const workers = await Promise.allSettled(Array.from({ length: Math.min(4, jobs.length) }, worker))
  if (workers.some(worker => worker.status === 'rejected')) result.unavailable = true
  result.pendingJobs += jobs.length - index
  return result
}
