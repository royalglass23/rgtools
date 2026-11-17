import { createServiceM8RequestFromEnv } from '@/lib/servicem8/client'
import { withWorkOrderRefreshLock } from '@/modules/work-orders/refresh-lock'
import { assessmentModel } from './assessment-provider'
import { createAssessmentRunRepository } from './assessment-run-store'
import { createAssessmentRunService } from './assessment-runs'
import { assessmentStore } from './assessment-store'
import { refreshDueAssessments } from './assessment-refresh'
import { dashboardSourceRequest, verifyDashboardVendor, withSourceBudget } from './source'

export function assessmentRunRuntime(sync: (actorId: string) => Promise<void> = async () => { throw new Error('Source refresh is unavailable here.') }) {
  return createAssessmentRunService({ repository: createAssessmentRunRepository(), inventory: () => assessmentStore.list(), sync,
    withSourceLock: operation => withWorkOrderRefreshLock(operation), model: assessmentModel(),
    assess: (job, actorId) => {
      const request = dashboardSourceRequest(createServiceM8RequestFromEnv({ timeoutMs: 5000, retry: { maxAttempts: 1 } }))
      return withSourceBudget(request, async bounded => {
        await verifyDashboardVendor(bounded)
        return refreshDueAssessments(bounded, actorId, { store: { ...assessmentStore, list: async () => [job] }, timeBudgetMs: 60_000 })
      }, { timeoutMs: 25_000, maxRequests: 24 })
    },
  })
}
