// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { refreshDueAssessments } from '../assessment-refresh'
import type { AssessmentJob, AssessmentStore, StoredAssessment, ProviderContext } from '../assessment'
import { unknownFields, FIELD_NAMES } from './operational-fixtures'
import type { OperationalField } from '../operational-assessment'

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
  const request = vi.fn(async (path: string) => ({ ok: true, status: 200, json: async () => path.startsWith('/job/') ? { uuid: 'source-1', job_description: current.description } : path.startsWith('/note.json') ? [{ uuid: 'note-1', related_object_uuid: 'source-1', active: 1, create_date: '2026-11-16 10:00:00', note: 'Install the shower on 20/11/2026. Email person@example.com; Private Customer, 22 Private Street.' }] : [] }))
  const provider = vi.fn(async (context: ProviderContext) => ({ results: context.items.map(item => item.token === 'p0' ? {
    item: item.token, status: 'dated', date: '2026-11-20', kind: 'installation', scope: 'product', productCue: 'shower', reason: 'Installation date stated in a staff note.',
    evidence: [{ source: context.sources.find(source => source.kind === 'note')!.token, quote: 'Install the shower on 20/11/2026.' }], fields: unknownFields(),
  } : { item: item.token, status: 'unknown', date: null, kind: 'unknown', scope: 'unclear', productCue: null, reason: 'No product date stated.', evidence: [], fields: unknownFields() }) }))
  return { current, saved, store, request, provider }
}

describe('refresh-triggered Work Orders evidence assessment', () => {
  it('does not send or store captured description text after a fresh explicit clear', async () => {
    const h = harness(), original = h.request.getMockImplementation()!
    h.request.mockImplementation(async path => path.startsWith('/job/') ? { ok: true, status: 200, json: async () => ({ uuid: 'source-1', job_description: null }) } : original(path))
    expect(await refreshDueAssessments(h.request, 'staff-1', { store: h.store, provider: h.provider })).toMatchObject({ failedJobs: 1, assessedProducts: 0 })
    expect(h.provider).not.toHaveBeenCalled(); expect(h.store.save).not.toHaveBeenCalled()
  })
  it('reassesses cached operational-v1 results instead of reusing pre-repair validation', async () => {
    const h = harness(), options = { store: h.store, provider: h.provider }
    await refreshDueAssessments(h.request, 'staff-1', options)
    for (const item of h.current.items) item.stored!.rules = 'kanban-operational-v1-20261117'
    expect(await refreshDueAssessments(h.request, 'staff-1', options)).toMatchObject({ assessedProducts: 2, reusedProducts: 0 })
    expect(h.provider).toHaveBeenCalledTimes(2)
  })
  it('stores a current result for every operational field without writing staff-owned values', async () => {
    const h = harness()
    const result = await refreshDueAssessments(h.request, 'staff-1', { store: h.store, provider: h.provider })
    expect(result.assessedProducts).toBe(2)
    expect(h.saved['item-1'].operational?.version).toBe(1)
    expect(Object.keys(h.saved['item-1'].operational!.fields)).toEqual([...FIELD_NAMES])
    expect(h.saved['item-1']).not.toHaveProperty('dashboardState')
    expect(h.saved['item-1']).not.toHaveProperty('installerId')
  })
  it('accepts a full independently specified positive response across every operational field', async () => {
    const h = harness(); h.current.items = [h.current.items[0]]
    h.current.installers = [{ token: 'i0', name: 'Synthetic Installer', id: 'configured-installer-id' }]
    const facts: Array<[string, string, string]> = [
      ['siteReady', 'yes', 'Shower site is ready.'], ['glassReady', 'yes', 'Shower glass is ready.'], ['hardwareReady', 'no', 'Shower hardware is not ready.'],
      ['designConfirmed', 'yes', 'Shower design is confirmed.'], ['ps1Required', 'yes', 'Shower PS1 is required.'], ['ps3Required', 'no', 'Shower PS3 is not required.'],
      ['ps1Issued', 'yes', 'Shower PS1 was issued.'], ['ps3Issued', 'no', 'Shower PS3 has not been issued.'], ['bottleStrut', 'yes', 'Shower bottle strut is required.'],
      ['buildingConsent', 'approved', 'Shower building consent is approved.'], ['buildingConsentNumber', 'BCO1234567', 'Shower building consent number BCO1234567.'],
      ['minorVariationRequired', 'no', 'Shower minor variation is not required.'], ['clientWaitingFor', 'glass arrival', 'Shower client is waiting for glass arrival.'],
      ['materialsEta', '2026-11-20', 'Shower materials ETA is 20/11/2026.'], ['aftercare', 'yes', 'Shower aftercare is required.'],
      ['installerId', 'i0', 'Shower installer is i0.'], ['estimatedHours', '2.5', 'Shower estimated labour: 2.5 hours.'],
    ]
    h.request.mockImplementation(async path => ({ ok: true, status: 200, json: async () => path.startsWith('/job/') ? { uuid: 'source-1', job_description: h.current.description } : path.startsWith('/note') ? facts.map(([field, , text]) => ({ uuid: field, related_object_uuid: 'source-1', active: 1, create_date: '2026-11-17 10:00:00', note: text.replace('i0', 'Synthetic Installer') })) : [] }))
    const provider = async (prepared: ProviderContext) => ({ results: [{ item: 'p0', status: 'unknown', date: null, kind: 'unknown', scope: 'unclear', productCue: null, reason: 'No installation date.', evidence: [], fields: Object.fromEntries(facts.map(([field, value, text]) => [field, { status: 'assessed', value, date: null, datePurpose: null, scope: 'product', productCue: 'shower', reason: 'Explicit synthetic field fact.', evidence: [{ source: prepared.sources.find(source => source.text === text)!.token, quote: text }] }])) }] })
    expect(await refreshDueAssessments(h.request, 'staff-1', { store: h.store, provider })).toMatchObject({ assessedProducts: 1, failedJobs: 0 })
    for (const [field, value] of facts) expect(h.saved['item-1'].operational!.fields[field as OperationalField]).toMatchObject({ status: 'assessed', value: field === 'installerId' ? 'configured-installer-id' : value })
    expect(h.saved['item-1'].operational!.gaps).toEqual([])
  })
  it('invalidates cache for custom-field or installer-inventory changes without using retrieval time as evidence', async () => {
    const h = harness(), original = h.request.getMockImplementation()!
    let custom = 'Shower glass ordered.'
    h.request.mockImplementation(async path => path.startsWith('/job/') ? { ok: true, status: 200, json: async () => ({ uuid: 'source-1', job_description: h.current.description, customfield_glass_order: custom }) } : original(path))
    const options = { store: h.store, provider: h.provider }
    await refreshDueAssessments(h.request, 'staff-1', options)
    expect((await refreshDueAssessments(h.request, 'staff-1', options)).reusedProducts).toBe(2)
    custom = 'Shower glass is ready.'
    expect((await refreshDueAssessments(h.request, 'staff-1', options)).assessedProducts).toBe(2)
    h.current.installers = [{ token: 'i0', name: 'Synthetic Installer', id: 'configured-installer-id' }]
    expect((await refreshDueAssessments(h.request, 'staff-1', options)).assessedProducts).toBe(2)
    expect(h.provider).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(h.provider.mock.calls)).not.toContain('configured-installer-id')
    expect(JSON.stringify(h.provider.mock.calls)).not.toContain('Synthetic Installer')
  })
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
    h.request.mockImplementation(async path => ({ ok: true, status: 200, json: async () => path.startsWith('/job/') ? { uuid: 'source-1', job_description: h.current.description } : path.startsWith('/note.json') ? [{ uuid: 'note-1', related_object_uuid: 'source-1', active: 1, create_date: '2026-11-17 10:00:00', note: 'Install the shower on 21/11/2026.' }] : [] }))
    h.provider.mockImplementation(async context => ({ results: context.items.map(item => item.token === 'p0' ? {
      item: item.token, status: 'dated', date: '2026-11-21', kind: 'installation', scope: 'product', productCue: 'shower', reason: 'Changed date.',
      evidence: [{ source: context.sources.find(source => source.kind === 'note')!.token, quote: 'Install the shower on 21/11/2026.' }], fields: unknownFields(),
    } : { item: item.token, status: 'unknown', date: null, kind: 'unknown', scope: 'unclear', productCue: null, reason: 'No date.', evidence: [], fields: unknownFields() }) }))
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
      return { ok: true, status: 200, json: async () => path.startsWith('/job/') ? { uuid: 'source-2', job_description: second.description } : path.startsWith('/note') ? [{ related_object_uuid: 'source-2', active: 1, create_date: '2026-11-17', note: 'Install the shower on 20/11/2026.' }] : [] }
    })
    let settled = false
    const running = refreshDueAssessments(request, 'staff-1', { store, provider }).then(result => { settled = true; return result })
    await called; await new Promise(resolve => setTimeout(resolve, 0))
    expect(settled).toBe(false); expect(store.save).not.toHaveBeenCalled()
    release()
    expect(await running).toMatchObject({ unavailable: true, failedJobs: 1, assessedProducts: 2 })
    expect(store.save).toHaveBeenCalledTimes(1)
  })
  it('records a safe actionable failure stage without persisting raw provider errors', async () => {
    const h = harness()
    h.provider.mockRejectedValueOnce(Object.assign(new Error('Sensitive provider details must not be saved'), { name: 'AbortError' }))
    await refreshDueAssessments(h.request, 'staff-1', { store: h.store, provider: h.provider })
    expect(h.store.fail).toHaveBeenLastCalledWith(h.current, expect.any(String), 'staff-1', expect.stringContaining('timed out'))
    h.provider.mockResolvedValueOnce({ results: [] })
    await refreshDueAssessments(h.request, 'staff-1', { store: h.store, provider: h.provider })
    expect(h.store.fail).toHaveBeenLastCalledWith(h.current, expect.any(String), 'staff-1', expect.stringContaining('could not be validated'))
    expect(JSON.stringify(vi.mocked(h.store.fail).mock.calls)).not.toContain('Sensitive provider details')
  })
})
