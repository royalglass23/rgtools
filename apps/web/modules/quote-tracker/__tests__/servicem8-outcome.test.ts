// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), audit: vi.fn(), transaction: vi.fn(), set: vi.fn(), where: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {
  select: () => ({ from: () => ({ where: () => ({ limit: mocks.read }) }) }),
  transaction: mocks.transaction,
} }))
vi.mock('@/lib/audit-db', () => ({ logAudit: mocks.audit }))
import { outcomeFromJobStatus, syncTrackedQuoteOutcome } from '../servicem8-outcome'
import { handleServiceM8QuoteStatusWebhook } from '../servicem8-status-webhook'

const uuid = '01a11890-73f9-7dbb-a2ab-35ed36ed866b'
const request = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  mocks.read.mockResolvedValue([{ id: uuid, outcome: null, version: '2026-10-23 10:00:00.123456+00' }])
  mocks.save.mockResolvedValue([{ id: uuid }])
  mocks.where.mockReturnValue({ returning: mocks.save })
  mocks.set.mockReturnValue({ where: mocks.where })
  mocks.transaction.mockImplementation(async (fn) => fn({ update: () => ({ set: mocks.set }) }))
  mocks.audit.mockResolvedValue(undefined)
  request.mockResolvedValue({ ok: true, status: 200, json: async () => ({ uuid, status: 'Work Order' }) })
})

describe('ServiceM8 quote outcomes', () => {
  it.each([['Work Order', 'won'], [' Completed ', 'won'], ['UNSUCCESSFUL', 'lost'], ['Quote', null], ['Unsuccessfull', undefined], ['', undefined], [null, undefined]])('maps %s to %s', (status, outcome) => {
    expect(outcomeFromJobStatus(status)).toBe(outcome)
  })
  it('persists verified status and audit together, using the full timestamp version', async () => {
    expect(await syncTrackedQuoteOutcome(uuid, { request })).toEqual({ status: 'changed', outcome: 'won' })
    expect(request).toHaveBeenCalledWith(`/job/${uuid}.json`)
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'won' }))
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ previousOutcome: null, outcome: 'won', source: 'servicem8' }) }), expect.anything())
  })
  it('returns a reopened Quote to pending and does not alter its tracking link', async () => {
    mocks.read.mockResolvedValue([{ id: uuid, outcome: 'lost', version: 'version' }])
    request.mockResolvedValue({ ok: true, status: 200, json: async () => ({ uuid, status: 'Quote' }) })
    await syncTrackedQuoteOutcome(uuid, { request })
    expect(mocks.set.mock.calls[0][0]).toEqual({ outcome: null, updatedAt: expect.anything() })
  })
  it('does not read ServiceM8 or create quotes for an untracked job', async () => {
    mocks.read.mockResolvedValue([])
    expect(await syncTrackedQuoteOutcome(uuid, { request })).toEqual({ status: 'untracked' })
    expect(request).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('keeps repeated events idempotent while advancing concurrency protection', async () => {
    mocks.read.mockResolvedValue([{ id: uuid, outcome: 'won', version: 'version' }])
    expect(await syncTrackedQuoteOutcome(uuid, { request })).toEqual({ status: 'unchanged', outcome: 'won' })
    expect(mocks.set).toHaveBeenCalledOnce()
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('does not write during a backfill dry run', async () => {
    expect(await syncTrackedQuoteOutcome(uuid, { request, dryRun: true })).toEqual({ status: 'changed', outcome: 'won' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each([
    { ok: false, status: 404, json: async () => ({}) },
    { ok: true, status: 200, json: async () => ({ uuid: 'different', status: 'Work Order' }) },
    { ok: true, status: 200, json: async () => ({ uuid, status: 'Unknown' }) },
    { ok: true, status: 200, json: async () => null },
  ])('keeps the previous outcome when the provider response is unusable: %#', async (response) => {
    request.mockResolvedValue(response)
    await expect(syncTrackedQuoteOutcome(uuid, { request })).rejects.toThrow()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('rejects a concurrent update so delivery retries with a fresh provider read', async () => {
    mocks.save.mockResolvedValue([])
    await expect(syncTrackedQuoteOutcome(uuid, { request })).rejects.toThrow('retry')
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('returns retryable 503 for a stalled response body without later persisting its outcome', async () => {
    vi.useFakeTimers()
    let finishBody!: (job: unknown) => void
    request.mockResolvedValue({ ok: true, status: 200, json: () => new Promise((resolve) => { finishBody = resolve }) })
    try {
      const result = handleServiceM8QuoteStatusWebhook({
        url: 'https://rgtools.example/api/servicem8/job?token=secret', headers: new Headers(),
        body: { type: 'job.status_changed', data: { uuid } },
      }, { secret: 'secret', sync: (id) => syncTrackedQuoteOutcome(id, { request }) })
      await vi.advanceTimersByTimeAsync(4000)
      expect((await result).status).toBe(503)
      finishBody({ uuid, status: 'Work Order' })
      await vi.advanceTimersByTimeAsync(1)
      expect(mocks.transaction).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('status webhook', () => {
  const input = { url: 'https://rgtools.example/api/servicem8/job?token=secret', headers: new Headers(), body: { type: 'job.status_changed', data: { uuid, status: 'Unsuccessful' } } }
  it('authenticates before syncing and ignores status claimed by the payload', async () => {
    const sync = vi.fn().mockResolvedValue({ status: 'changed', outcome: 'won' })
    expect((await handleServiceM8QuoteStatusWebhook(input, { secret: 'secret', sync })).status).toBe(200)
    expect(sync).toHaveBeenCalledExactlyOnceWith(uuid)
    expect((await handleServiceM8QuoteStatusWebhook({ ...input, url: 'https://rgtools.example/api/servicem8/job' }, { secret: 'secret', sync })).status).toBe(401)
    expect(sync).toHaveBeenCalledOnce()
  })
  it('rejects malformed identifiers before a provider lookup', async () => {
    const sync = vi.fn()
    expect((await handleServiceM8QuoteStatusWebhook({ ...input, body: { type: 'job.status_changed', data: { uuid: '../job' } } }, { secret: 'secret', sync })).status).toBe(422)
    expect(sync).not.toHaveBeenCalled()
  })
  it('requests retry when persistence or provider reads fail', async () => {
    const sync = vi.fn().mockRejectedValue(new Error('provider detail must not leak'))
    const result = await handleServiceM8QuoteStatusWebhook(input, { secret: 'secret', sync })
    expect(result.status).toBe(503)
    expect(JSON.stringify(result)).not.toContain('provider detail')
  })
})
