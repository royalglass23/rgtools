import type { ServiceM8FetchRequest } from '@/lib/servicem8/client'
import { ASSESSMENT_RULES, validateAssessmentOutput, type AssessmentStore, type ProviderContext, type StoredAssessment } from './assessment'
import { ASSESSMENT_SOURCE_POLICY, assessmentContextHash, assessmentInstallerVersion, assessmentSnapshotHash, loadAssessmentContext } from './assessment-source'
import { assessmentModel, generateDueAssessment } from './assessment-provider'
import { OPERATIONAL_SCHEMA, validateOperationalAssessmentOutput, type OperationalAssessment } from './operational-assessment'

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
      let stage: 'source' | 'provider' | 'validation' | 'persistence' = 'source'
      try {
        const context = await loadAssessmentContext(job, request)
        const sourceHash = assessmentContextHash(context), checkedAt = now().toISOString()
        const cached = job.items.every(item => item.stored?.state === 'complete' && item.stored.operational?.version === OPERATIONAL_SCHEMA && item.stored.sourceHash === sourceHash && item.stored.rules === ASSESSMENT_RULES && item.stored.model === model)
        let proposals: Array<StoredAssessment['result']>
        let operational: OperationalAssessment[]
        if (cached) { proposals = job.items.map(item => item.stored!.result); operational = job.items.map(item => item.stored!.operational!) }
        else {
          stage = 'provider'
          const output = await provider({ items: context.items, coverage: context.coverage, installers: context.installers?.map(({ token }) => ({ token })), sources: context.sources.map(source => ({ token: source.token, kind: source.kind, item: source.item, observedAt: source.observedAt, text: source.text, installerTokens: source.installerTokens })) })
          stage = 'validation'
          proposals = validateAssessmentOutput(output, context)
          operational = validateOperationalAssessmentOutput(output, context)
        }
        const values: Record<string, StoredAssessment> = {}
        job.items.forEach((item, i) => { values[item.id] = { state: 'complete', sourceHash, snapshotHash: assessmentSnapshotHash(job.description, item.description), rules: ASSESSMENT_RULES, model,
          checkedAt, assessedAt: cached ? item.stored!.assessedAt : checkedAt, result: proposals[i], operational: operational[i], coverage: context.coverage, sourceGeneration: job.sourceGeneration ?? null, installerVersion: assessmentInstallerVersion(context.installers ?? []), sourcePolicy: ASSESSMENT_SOURCE_POLICY, error: null } })
        stage = 'persistence'
        if (await store.save({ ...job, assessmentReused: cached }, values, actorId)) {
          if (cached) result.reusedProducts += job.items.length
          else result.assessedProducts += job.items.length
        } else result.pendingJobs++
      } catch (error) {
        result.failedJobs++
        const message = stage === 'source' ? 'Complete date evidence could not be prepared from ServiceM8. Refresh to retry or ask an administrator to check source access and evidence limits.'
          : stage === 'validation' ? 'The AI date assessment could not be validated. No automatic date was accepted; refresh to retry or enter a staff target.'
          : stage === 'persistence' ? 'The date assessment could not be saved. Refresh to retry; staff fields are unchanged.'
          : error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name) ? 'AI date assessment timed out. Refresh to retry or enter a staff target.'
          : 'The AI date assessment provider could not finish. Refresh to retry or ask an administrator to check AI configuration.'
        try { await store.fail(job, now().toISOString(), actorId, message) }
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
