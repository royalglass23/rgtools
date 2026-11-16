// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { refreshDueAssessments } from '../assessment-refresh'
import type { AssessmentJob, AssessmentStore, StoredAssessment, ProviderContext } from '../assessment'

const job = (): AssessmentJob => ({ id: 'job-1', sourceId: 'source-1', customer: 'Private Customer', address: '22 Private Street', description: 'Confirmed Work Order', items: [
  { id: 'item-1', label: 'Shower', description: 'Shower clear glass', stored: null },
  { id: 'item-2', label: 'Balustrade', description: 'Balustrade deck', stored: null },
] })
function harness() {
  const current = job()
  const saved: Record<string, StoredAssessment> = {}
  const store: AssessmentStore = {
    list: async () => [current],
    save: vi.fn(async (_job, values) => { Object.assign(saved, values); for (const item of current.items) item.stored = values[item.id]; return true }),
    fail: vi.fn(async () => {}),
  }
  const request = vi.fn(async (path: string) => ({ ok: true, status: 200, json: async () => path.startsWith('/note.json') ? [{ uuid: 'note-1', related_object_uuid: 'source-1', active: 1, create_date: '2026-11-16 10:00:00', note: 'Install the shower on 20/11/2026. Email person@example.com; Private Customer, 22 Private Street.' }] : [] }))
  const provider = vi.fn(async (context: ProviderContext) => ({ results: context.items.map(item => item.token === 'p0' ? {
    item: item.token, status: 'dated', date: '2026-11-20', kind: 'installation', scope: 'product', productCue: 'shower', reason: 'Installation date stated in a staff note.',
    evidence: [{ source: context.sources.find(source => source.kind === 'note')!.token, quote: 'Install the shower on 20/11/2026.' }],
  } : { item: item.token, status: 'unknown', date: null, kind: 'unknown', scope: 'unclear', productCue: null, reason: 'No product date stated.', evidence: [] }) }))
  return { current, saved, store, request, provider }
}

describe('refresh-triggered Work Orders evidence assessment', () => {
  it('assesses new note evidence per product, sanitizes source and reuses unchanged evidence on the next refresh', async () => {
    const h = harness()
    const options = { store: h.store, provider: h.provider, model: 'fixture-model', now: () => new Date('2026-11-16T00:00:00Z') }
    const first = await refreshDueAssessments(h.request, 'staff-1', options)
    expect(first.assessedProducts).toBe(2)
    expect(h.saved['item-1'].result).toMatchObject({ date: '2026-11-20', status: 'dated', kind: 'installation' })
    expect(h.saved['item-2'].result).toMatchObject({ date: null, status: 'unknown' })
    const sent = JSON.stringify(h.provider.mock.calls[0][0])
    expect(sent).not.toContain('Private Customer'); expect(sent).not.toContain('22 Private Street'); expect(sent).not.toContain('person@example.com')
    const next = await refreshDueAssessments(h.request, 'staff-1', options)
    expect(next.reusedProducts).toBe(2); expect(h.provider).toHaveBeenCalledTimes(1)
    expect(h.store.fail).not.toHaveBeenCalled()
  })
  it('reassesses a note-only change and does not cache it as an unchanged job', async () => {
    const h = harness(), options = { store: h.store, provider: h.provider, model: 'fixture-model' }
    await refreshDueAssessments(h.request, 'staff-1', options)
    h.request.mockImplementation(async path => ({ ok: true, status: 200, json: async () => path.startsWith('/note.json') ? [{ uuid: 'note-1', related_object_uuid: 'source-1', active: 1, create_date: '2026-11-17 10:00:00', note: 'Install the shower on 21/11/2026.' }] : [] }))
    h.provider.mockImplementation(async context => ({ results: context.items.map(item => item.token === 'p0' ? {
      item: item.token, status: 'dated', date: '2026-11-21', kind: 'installation', scope: 'product', productCue: 'shower', reason: 'Changed date.',
      evidence: [{ source: context.sources.find(source => source.kind === 'note')!.token, quote: 'Install the shower on 21/11/2026.' }],
    } : { item: item.token, status: 'unknown', date: null, kind: 'unknown', scope: 'unclear', productCue: null, reason: 'No date.', evidence: [] }) }))
    const next = await refreshDueAssessments(h.request, 'staff-1', options)
    expect(next.assessedProducts).toBe(2); expect(h.provider).toHaveBeenCalledTimes(2)
    expect(h.saved['item-1'].result?.date).toBe('2026-11-21')
  })
  it('does not publish no-date results after an incomplete or forbidden source read', async () => {
    const h = harness()
    h.request.mockImplementation(async () => ({ ok: false, status: 403, json: async () => [] }))
    expect((await refreshDueAssessments(h.request, 'staff-1', { store: h.store, provider: h.provider })).failedJobs).toBe(1)
    expect(h.provider).not.toHaveBeenCalled(); expect(h.store.save).not.toHaveBeenCalled(); expect(h.store.fail).toHaveBeenCalled()
  })
  it('leaves budget-limited work pending and retries failed provider calls instead of replacing manual state', async () => {
    const h = harness()
    expect((await refreshDueAssessments(h.request, 'staff-1', { store: h.store, provider: h.provider, timeBudgetMs: 0 })).pendingJobs).toBe(1)
    expect(h.provider).not.toHaveBeenCalled()
    h.provider.mockRejectedValueOnce(new Error('Provider unavailable'))
    expect((await refreshDueAssessments(h.request, 'staff-1', { store: h.store, provider: h.provider })).failedJobs).toBe(1)
    expect(h.store.save).not.toHaveBeenCalled(); expect(h.current.items[0].stored).toBeNull()
  })
  it('drains an in-flight sibling before returning when saving a failure rejects', async () => {
    const h = harness(), second = { ...job(), id: 'job-2', sourceId: 'source-2' }
    const store: AssessmentStore = { list: async () => [h.current, second], save: vi.fn(async () => true), fail: vi.fn(async () => { throw new Error('DB unavailable') }) }
    let release!: () => void, started!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve }), called = new Promise<void>(resolve => { started = resolve })
    const provider = vi.fn(async (context: ProviderContext) => { started(); await waiting; return h.provider(context) })
    const request = vi.fn(async (path: string) => {
      if (path.includes('source-1')) throw new Error('Source failed')
      return { ok: true, status: 200, json: async () => path.startsWith('/note') ? [{ related_object_uuid: 'source-2', active: 1, create_date: '2026-11-17', note: 'Install the shower on 20/11/2026.' }] : [] }
    })
    let settled = false
    const running = refreshDueAssessments(request, 'staff-1', { store, provider }).then(result => { settled = true; return result })
    await called; await new Promise(resolve => setTimeout(resolve, 0))
    expect(settled).toBe(false); expect(store.save).not.toHaveBeenCalled()
    release()
    expect(await running).toMatchObject({ unavailable: true, failedJobs: 1, assessedProducts: 2 })
    expect(store.save).toHaveBeenCalledTimes(1)
  })
})
