// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/servicem8/client', () => ({
  getServiceM8ApiKey: () => 'service-m8-api-key',
  getServiceM8FullApiKey: () => 'service-m8-full-api-key',
}))

describe('register ServiceM8 job-created webhook', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
    process.exitCode = 0
    delete process.env.SERVICEM8_JOB_WEBHOOK_URL
    delete process.env.SERVICEM8_JOB_WEBHOOK_SECRET
  })

  it('subscribes to the job.created event', async () => {
    process.env.SERVICEM8_JOB_WEBHOOK_URL = 'https://rgtools.example/api/servicem8/job'
    process.env.SERVICEM8_JOB_WEBHOOK_SECRET = 'webhook-secret'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"success":true}',
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await import('../register-servicem8-job-webhook')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = init.body as URLSearchParams
    expect(url).toBe('https://api.servicem8.com/webhook_subscriptions/event')
    expect(new Headers(init.headers).get('X-API-Key')).toBe('service-m8-full-api-key')
    expect(body.get('event')).toBe('job.created')
    expect(body.has('object')).toBe(false)
    expect(body.has('fields')).toBe(false)
  })

  it('redacts the callback credential from provider registration errors', async () => {
    const secret = 'alpha beta+gamma%delta~omega'
    process.env.SERVICEM8_JOB_WEBHOOK_URL = 'https://rgtools.example/api/servicem8/job'
    process.env.SERVICEM8_JOB_WEBHOOK_SECRET = secret
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Invalid callback https://rgtools.example/api/servicem8/job?token=alpha+beta%2Bgamma%25delta%7Eomega',
    }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await import('../register-servicem8-job-webhook')
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledOnce())

    const logged = errorSpy.mock.calls.flat().map(String).join(' ')
    expect(logged).not.toContain(secret)
    expect(logged).not.toContain('alpha+beta%2Bgamma%25delta%7Eomega')
    expect(logged).toContain('[REDACTED]')
  })

  it('redacts the callback credential from successful provider responses', async () => {
    const secret = 'alpha beta+gamma%delta~omega'
    process.env.SERVICEM8_JOB_WEBHOOK_URL = 'https://rgtools.example/api/servicem8/job'
    process.env.SERVICEM8_JOB_WEBHOOK_SECRET = secret
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'Registered https://rgtools.example/api/servicem8/job?token=alpha+beta%2Bgamma%25delta%7Eomega',
    }))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await import('../register-servicem8-job-webhook')
    await vi.waitFor(() => expect(logSpy.mock.calls.some((call) =>
      call.map(String).join(' ').includes('Registered ServiceM8 job webhook'),
    )).toBe(true))

    const logged = logSpy.mock.calls
      .map((call) => call.map(String).join(' '))
      .find((line) => line.includes('Registered ServiceM8 job webhook')) ?? ''
    expect(logged).not.toContain(secret)
    expect(logged).not.toContain('alpha+beta%2Bgamma%25delta%7Eomega')
    expect(logged).toContain('[REDACTED]')
  })
})
