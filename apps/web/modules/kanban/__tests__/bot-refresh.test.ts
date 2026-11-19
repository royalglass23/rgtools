import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), fetch: vi.fn(), version: vi.fn() }))
vi.mock('@/lib/dashboard-access', () => ({ requireDashboardUser: mocks.auth }))
vi.mock('../publication-store', () => ({ readPublicationVersion: mocks.version }))
import { startPublishedRefresh, currentPublicationVersion } from '../bot-refresh'
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('fetch', mocks.fetch); mocks.auth.mockResolvedValue({ id: 'staff' })
  vi.stubEnv('KANBAN_BOT_WEBHOOK_URL', 'https://bot.example.test/refresh'); vi.stubEnv('KANBAN_BOT_WEBHOOK_SECRET', 'fictional-trigger')
  mocks.fetch.mockResolvedValue(new Response('', { status: 200 }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('direct Kanban update dispatch', () => {
  it('accepts a request without Google or completion configuration and never claims completion', async () => {
    vi.stubEnv('KANBAN_BOT_RECEIPTS_RANGE', ''); vi.stubEnv('KANBAN_GOOGLE_WIF_PROVIDER', '')
    expect(await startPublishedRefresh()).toMatchObject({ ok: true, requestId: expect.any(String) })
    const [url, init] = mocks.fetch.mock.calls[0]; expect(url).toBe('https://bot.example.test/refresh')
    expect(init.headers.Authorization).toBe('Bearer fictional-trigger'); expect(init.redirect).toBe('error')
    expect(JSON.parse(init.body)).toMatchObject({ action: 'refresh_work_orders', requestId: expect.any(String) })
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })
  it('authorizes both request and version reads before contacting integrations', async () => {
    mocks.auth.mockRejectedValue(new Error('sign in'))
    await expect(startPublishedRefresh()).rejects.toThrow('sign in'); await expect(currentPublicationVersion()).rejects.toThrow('sign in')
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.version).not.toHaveBeenCalled()
  })
  it('fails closed on missing/unsafe webhook config and never auto-retries transport uncertainty', async () => {
    vi.stubEnv('KANBAN_BOT_WEBHOOK_URL', 'http://bot.example.test/refresh')
    expect(await startPublishedRefresh()).toMatchObject({ ok: false }); expect(mocks.fetch).not.toHaveBeenCalled()
    vi.stubEnv('KANBAN_BOT_WEBHOOK_URL', 'https://bot.example.test/refresh'); mocks.fetch.mockRejectedValue(new Error('private credential'))
    const result = await startPublishedRefresh(); expect(result).toMatchObject({ ok: false }); expect(JSON.stringify(result)).not.toContain('private credential'); expect(mocks.fetch).toHaveBeenCalledOnce()
  })
  it('accepts only the routine-specific HTTP200 acknowledgement and releases response bodies', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    mocks.fetch.mockResolvedValue({ ok: true, status: 202, body: { cancel } })
    expect(await startPublishedRefresh()).toMatchObject({ ok: false }); expect(cancel).toHaveBeenCalledOnce()
  })
})
