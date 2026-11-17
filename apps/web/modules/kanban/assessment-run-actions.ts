'use server'
import { requireDashboardUser } from '@/lib/dashboard-access'
import { acquireWorkOrderRateLimit } from '@/modules/work-orders/refresh-lock'
import { assessmentRunRuntime } from './assessment-run-runtime'
import { createAssessmentRunRequests } from './assessment-run-requests'

function requests() { return createAssessmentRunRequests({ user: requireDashboardUser, rate: acquireWorkOrderRateLimit, service: assessmentRunRuntime }) }
export async function assessmentRunStatusAction(runId?: string) {
  return requests().status(runId)
}
export async function continueAssessmentRunAction(runId: string) {
  return requests().continue(runId)
}
