// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../../lib/servicem8/client', () => ({ getServiceM8FullApiKey: () => 'test-key' }))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); process.exitCode = 0 })

it('registers a separate status-change subscription and redacts its callback credential', async () => {
  vi.stubEnv('SERVICEM8_JOB_WEBHOOK_URL', 'https://rgtools.example/api/servicem8/job')
  vi.stubEnv('SERVICEM8_JOB_WEBHOOK_SECRET', 'status-secret')
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'callback?token=status-secret' })
  vi.stubGlobal('fetch', fetch)
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await import('../register-servicem8-quote-status-webhook')
  await vi.waitFor(() => expect(log).toHaveBeenCalledOnce())
  const [url, init] = fetch.mock.calls[0]
  expect(url).toBe('https://api.servicem8.com/webhook_subscriptions/event')
  expect(init.body.get('event')).toBe('job.status_changed')
  expect(init.body.get('unique_id')).toBe('rgtools-quote-status-webhook')
  expect(log.mock.calls.flat().join(' ')).not.toContain('status-secret')
})
