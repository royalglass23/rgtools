import type { RunProgress } from './assessment-runs'

type RunService = { status: (id?: string) => Promise<RunProgress | null>; continue: (id: string, actorId: string) => Promise<RunProgress> }
// Public request boundary, independently testable with synthetic auth/storage.
// No actor ID supplied by the browser is trusted.
export function createAssessmentRunRequests(deps: { user: () => Promise<{ id: string }>; rate: (action: string, actorId: string, seconds: number) => Promise<boolean>; service: () => RunService }) {
  async function authorize(action: string, raw?: unknown) {
    const user = await deps.user()
    if (raw !== undefined && (typeof raw !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw))) throw new Error('Invalid assessment run.')
    if (!(await deps.rate(action, user.id, 2))) throw new Error('Assessment progress was requested recently. Please wait and retry.')
    return user
  }
  return {
    async status(raw?: unknown) { await authorize('assessment-status', raw); return deps.service().status(raw as string | undefined) },
    async continue(raw: unknown) { const user = await authorize('assessment-continue', raw); if (raw === undefined) throw new Error('Invalid assessment run.'); return deps.service().continue(raw as string, user.id) },
  }
}
