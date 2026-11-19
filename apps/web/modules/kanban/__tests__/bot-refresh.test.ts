import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), range: vi.fn(), fetch: vi.fn(), identity: vi.fn(), receiptMessage: vi.fn() }))
vi.mock('@/lib/dashboard-access', () => ({ requireDashboardUser: mocks.auth }))
vi.mock('../published-source', () => ({ readPublishedRange: mocks.range, publishedSourceConfigured: () => true, getReceiptReadMessage: mocks.receiptMessage }))
vi.mock('../keyless-google-auth', () => ({ verifyPublishedSourceIdentity: mocks.identity }))
import { startPublishedRefresh, publishedRefreshStatus } from '../bot-refresh'

beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('fetch', mocks.fetch)
  vi.stubEnv('KANBAN_BOT_WEBHOOK_URL', 'https://bot.example.test/refresh')
  vi.stubEnv('KANBAN_BOT_WEBHOOK_SECRET', 'fictional-secret')
  vi.stubEnv('KANBAN_BOT_RECEIPTS_RANGE', "'RGTools Refresh'!A:D")
  mocks.auth.mockResolvedValue({ id: 'staff' }); mocks.fetch.mockResolvedValue(new Response('', { status: 200 }))
})
const id = '12345678-1234-4123-8123-123456789abc'
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('published Kanban refresh boundary', () => {
  it('authorizes before contacting the bot; acceptance is only pending', async () => {
    const result = await startPublishedRefresh()
    expect(result.ok).toBe(true)
    expect(result).not.toHaveProperty('completed')
    expect(mocks.auth).toHaveBeenCalledOnce()
    const [url, init] = mocks.fetch.mock.calls[0]
    expect(url).toBe('https://bot.example.test/refresh')
    expect(init.headers.Authorization).toBe('Bearer fictional-secret')
    expect(JSON.parse(init.body).requestId).toMatch(/^[\da-f-]{36}$/)
    expect(JSON.stringify(result)).not.toContain('fictional-secret')
  })
  it('does not trigger without completion configuration', async () => {
    vi.stubEnv('KANBAN_BOT_RECEIPTS_RANGE', '')
    expect(await startPublishedRefresh()).toMatchObject({ ok: false })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('does not start the bot when the current Vercel identity is unavailable', async () => {
    mocks.identity.mockRejectedValue(new Error('unreadable token file with private path'))
    expect(await startPublishedRefresh()).toEqual({ ok: false, error: 'The Vercel identity for Kanban is unavailable. Ask an administrator to check OIDC access before refreshing.' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('does not contact any integration when unauthenticated', async () => {
    mocks.auth.mockRejectedValue(new Error('redirect'))
    await expect(startPublishedRefresh()).rejects.toThrow('redirect')
    await expect(publishedRefreshStatus(id)).rejects.toThrow('redirect')
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.range).not.toHaveBeenCalled()
  })
  it.each(['success', 'no_change'])('requires the matching request receipt for %s completion', async status => {
    mocks.range.mockResolvedValue([['requestId', 'status', 'outputVersion', 'completedAt'], ['another-request', status, 'v2', '2026-11-19T01:00:00Z']])
    expect(await publishedRefreshStatus(id)).toEqual({ state: 'pending' })
    mocks.range.mockResolvedValue([['requestId', 'status', 'outputVersion', 'completedAt'], [id, status, 'v2', '2026-11-19T01:00:00Z']])
    expect(await publishedRefreshStatus(id)).toMatchObject({ state: 'complete', changed: status === 'success' })
  })
  it('keeps invalid IDs, malformed success receipts and duplicate receipt IDs unconfirmed', async () => {
    expect(await publishedRefreshStatus('bad')).toMatchObject({ state: 'unconfirmed' })
    expect(mocks.range).not.toHaveBeenCalled()
    mocks.range.mockResolvedValue([['requestId', 'status', 'outputVersion', 'completedAt'], [id, 'success', '', '']])
    expect(await publishedRefreshStatus(id)).toMatchObject({ state: 'unconfirmed' })
    mocks.range.mockResolvedValue([['requestId', 'status', 'outputVersion', 'completedAt'], [id, 'failed', '', ''], [id, 'success', 'v1', '2026-11-19T01:00:00Z']])
    expect(await publishedRefreshStatus(id)).toMatchObject({ state: 'unconfirmed' })
  })
  it('distinguishes an unavailable receipt check from an explicit matching bot failure', async () => {
    mocks.range.mockRejectedValueOnce(new Error('fictional private SDK payload'))
    const unavailable = await publishedRefreshStatus(id)
    expect(unavailable).toMatchObject({ state: 'unconfirmed' })
    expect(JSON.stringify(unavailable)).not.toContain('private SDK payload')
    mocks.range.mockResolvedValueOnce([['requestId', 'status', 'outputVersion', 'completedAt'], [id, 'failed', '', '']])
    expect(await publishedRefreshStatus(id)).toMatchObject({ state: 'failed' })
  })
  it('uses only the source helper safe message for actionable receipt-read failures', async () => {
    const failure = new Error('fictional secret Google response body')
    mocks.range.mockRejectedValueOnce(failure)
    mocks.receiptMessage.mockReturnValueOnce('The completion Sheet could not be accessed. Status checking will continue.')
    expect(await publishedRefreshStatus(id)).toEqual({ state: 'unconfirmed', error: 'The completion Sheet could not be accessed. Status checking will continue.' })
    expect(mocks.receiptMessage).toHaveBeenCalledWith(failure)
  })
  it('reports an uncertain trigger safely and never retries automatically', async () => {
    mocks.fetch.mockRejectedValue(new Error('fictional-secret sensitive URL'))
    const result = await startPublishedRefresh()
    expect(result).toMatchObject({ ok: false })
    expect(JSON.stringify(result)).not.toContain('fictional-secret')
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })
})
