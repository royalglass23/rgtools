// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createAssessmentRunService, type AssessmentRunRepository, type RunProgress } from '../assessment-runs'
import type { AssessmentJob } from '../assessment'
import { createAssessmentRunRequests } from '../assessment-run-requests'

const inventory = (): AssessmentJob[] => Array.from({ length: 7 }, (_, i) => ({ id: `job-${i}`, sourceId: `source-${i}`, customer: 'Synthetic', address: null, description: 'Synthetic', sourceGeneration: '2026-11-18T00:00:00Z', items: [{ id: `item-${i}`, description: 'Shower', label: 'Shower', stored: null }] }))
function repository(): AssessmentRunRepository {
  let current: RunProgress | null = null
  let pending: AssessmentJob[] = []
  return {
    current: async () => current,
    ensure: async (jobs, snapshot, actorId, versions) => {
      if (current?.snapshot === snapshot && current.state === 'active') return current
      pending = [...jobs]
      current = { id: crypto.randomUUID(), snapshot, requesterId: actorId, ...versions, state: jobs.length ? 'active' : 'complete', totalJobs: jobs.length, completedJobs: 0, pendingJobs: jobs.length, failedJobs: 0, unavailableJobs: 0, assessedProducts: 0, reusedProducts: 0, reviewProducts: 0, sourceSyncedAt: '2026-11-18T00:00:00Z', completedAt: null, reason: null }
      return current
    },
    claim: async (runId, actorId, limit) => pending.splice(0, limit).map(job => ({ job, claim: { runId, workId: job.id, token: crypto.randomUUID(), executorId: actorId } })),
    finish: async (_claim, outcome) => {
      if (!current) return
      current.completedJobs++; current.pendingJobs--; current.assessedProducts += outcome.assessedProducts; current.reusedProducts += outcome.reusedProducts
      if (!current.pendingJobs) current.state = 'complete'
    },
    status: async () => current,
  }
}
describe('durable assessment run service', () => {
  it('finishes inventory spanning several batches from one source sync and assessment-only continuations', async () => {
    const sync = vi.fn(async () => {}), jobs = inventory(), actors: string[] = []
    const service = createAssessmentRunService({ repository: repository(), inventory: async () => jobs, sync, withSourceLock: async operation => operation(), assess: async (_job, actor) => { actors.push(actor); return { assessedProducts: 1, reusedProducts: 0, failedJobs: 0, pendingJobs: 0, unavailable: false } }, batchSize: 2, model: 'synthetic' })
    let progress = await service.start('requester')
    expect(progress).toMatchObject({ state: 'active', pendingJobs: 7, completedJobs: 0 })
    for (let pass = 0; pass < 4; pass++) progress = await service.continue(progress.id, 'current-executor')
    expect(progress).toMatchObject({ state: 'complete', totalJobs: 7, completedJobs: 7, pendingJobs: 0, assessedProducts: 7 })
    expect(sync).toHaveBeenCalledTimes(1)
    expect(actors).toEqual(Array(7).fill('current-executor'))
  })
  it('resumes the current snapshot without another full source sync or staff-edit starvation', async () => {
    const sync = vi.fn(async () => {}), jobs = inventory(), repo = repository()
    const make = () => createAssessmentRunService({ repository: repo, inventory: async () => jobs, sync, withSourceLock: async operation => operation(), assess: async () => ({ assessedProducts: 1, reusedProducts: 0, failedJobs: 0, pendingJobs: 0, unavailable: false }), batchSize: 2, model: 'synthetic' })
    const started = await make().start('first')
    jobs[0].items[0].label = 'Changed staff label'
    expect((await make().start('second')).id).toBe(started.id)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(await make().continue(started.id, 'second')).toMatchObject({ pendingJobs: 5, completedJobs: 2 })
  })
  it('drains an in-flight sibling before releasing the source lock after failure', async () => {
    let finish!: () => void, called!: () => void
    const waiting = new Promise<void>(resolve => { finish = resolve }), entered = new Promise<void>(resolve => { called = resolve })
    let released = false
    const service = createAssessmentRunService({ repository: repository(), inventory: async () => inventory().slice(0, 2), sync: async () => {}, withSourceLock: async operation => { try { return await operation() } finally { released = true } }, assess: async job => { if (job.id === 'job-0') throw new Error('Synthetic failure'); called(); await waiting; return { assessedProducts: 1, reusedProducts: 0, failedJobs: 0, pendingJobs: 0, unavailable: false } }, model: 'synthetic' })
    const run = await service.start('requester'); released = false
    const work = service.continue(run.id, 'executor')
    await entered; expect(released).toBe(false)
    finish(); await work; expect(released).toBe(true)
  })
  it('authenticates and rate-limits every request, validates IDs, and uses the present executor', async () => {
    const user = vi.fn(async () => ({ id: 'present-executor' })), rate = vi.fn(async () => true)
    const status = vi.fn(async () => null), next = vi.fn(async () => ({}) as RunProgress)
    const requests = createAssessmentRunRequests({ user, rate, service: () => ({ status, continue: next }) })
    const id = '96ef22f0-b463-4a4d-a239-adc0f57fc992'
    await requests.status(); await requests.continue(id)
    expect(next).toHaveBeenCalledWith(id, 'present-executor')
    expect(rate.mock.calls).toEqual([['assessment-status', 'present-executor', 2], ['assessment-continue', 'present-executor', 2]])
    await expect(requests.continue('bad')).rejects.toThrow('Invalid assessment run')
    rate.mockResolvedValue(false); await expect(requests.continue(id)).rejects.toThrow('requested recently')
    expect(next).toHaveBeenCalledTimes(1)
    user.mockRejectedValue(new Error('Account removed')); await expect(requests.status()).rejects.toThrow('Account removed')
    expect(status).toHaveBeenCalledTimes(1)
  })
})
