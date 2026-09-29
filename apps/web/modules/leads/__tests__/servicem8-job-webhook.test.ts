// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { handleServiceM8JobWebhook } from '../servicem8-job-webhook'

describe('handleServiceM8JobWebhook', () => {
  it('reconciles a converted calculator job with a legacy colon reference before acknowledging it', async () => {
    const reconcileLead = vi.fn().mockResolvedValue({ ok: true, customFieldUpdated: true })
    const request = vi.fn(async (path: string) => {
      if (path === '/job/job-uuid-2.json') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ job_description: 'RGTools Lead - Leads Quality E - Janis Ellery' }),
        }
      }
      expect(path).toBe('/inboxmessage.json?limit=500&offset=0&filter=all')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messages: [{
            converted_to_job_uuid: 'job-uuid-2',
            message_text: [
              '--- Reference ---',
              'RGTools Lead: 61b8194e-463a-4614-97eb-e3f8a1342989',
            ].join('\n'),
          }],
        }),
      }
    })

    const result = await handleServiceM8JobWebhook({
      url: 'https://rgtools.example/api/servicem8/job?token=webhook-secret',
      headers: new Headers(),
      body: {
        object: 'job',
        entry: [{ uuid: 'job-uuid-2' }],
      },
      deps: {
        secret: 'webhook-secret',
        request,
        reconcileLead,
      },
    })

    expect(result).toEqual({ status: 200, body: { ok: true, processed: 1 } })
    expect(reconcileLead).toHaveBeenCalledWith('61b8194e-463a-4614-97eb-e3f8a1342989')
  })

  it('asks ServiceM8 to retry when the created job cannot be fetched', async () => {
    const result = await handleServiceM8JobWebhook({
      url: 'https://rgtools.example/api/servicem8/job?token=webhook-secret',
      headers: new Headers(),
      body: { object: 'job', entry: [{ uuid: 'job-uuid-2' }] },
      deps: {
        secret: 'webhook-secret',
        request: vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          json: async () => ({}),
        }),
      },
    })

    expect(result).toEqual({
      status: 503,
      body: { error: 'ServiceM8 job lookup failed' },
    })
  })

  it('asks ServiceM8 to retry when calculator job reconciliation throws', async () => {
    const request = vi.fn(async (path: string) => ({
      ok: true,
      status: 200,
      json: async () => path.startsWith('/job/')
        ? { job_description: 'RGTools Lead - Leads Quality E - Janis Ellery' }
        : {
            messages: [{
              converted_to_job_uuid: 'job-uuid-2',
              message_text: 'RGTools Lead: 61b8194e-463a-4614-97eb-e3f8a1342989',
            }],
          },
    }))

    const result = await handleServiceM8JobWebhook({
      url: 'https://rgtools.example/api/servicem8/job?token=webhook-secret',
      headers: new Headers(),
      body: { object: 'job', entry: [{ uuid: 'job-uuid-2' }] },
      deps: {
        secret: 'webhook-secret',
        request,
        reconcileLead: vi.fn().mockRejectedValue(new Error('write failed')),
      },
    })

    expect(result).toEqual({
      status: 503,
      body: { error: 'Calculator job reconciliation failed' },
    })
  })

  it('deduplicates repeated job UUIDs in one callback', async () => {
    const request = vi.fn(async (path: string) => ({
      ok: true,
      status: 200,
      json: async () => path.startsWith('/job/')
        ? { job_description: 'RGTools Lead - Leads Quality E - Janis Ellery' }
        : {
            messages: [{
              converted_to_job_uuid: 'job-uuid-2',
              message_text: 'RGTools Lead: 61b8194e-463a-4614-97eb-e3f8a1342989',
            }],
          },
    }))
    const reconcileLead = vi.fn().mockResolvedValue({ ok: true, customFieldUpdated: true })

    const result = await handleServiceM8JobWebhook({
      url: 'https://rgtools.example/api/servicem8/job?token=webhook-secret',
      headers: new Headers(),
      body: {
        object: 'job',
        entry: [{ uuid: 'job-uuid-2' }, { uuid: 'job-uuid-2' }],
      },
      deps: { secret: 'webhook-secret', request, reconcileLead },
    })

    expect(result).toEqual({ status: 200, body: { ok: true, processed: 1 } })
    expect(reconcileLead).toHaveBeenCalledOnce()
  })

  it('rejects more than 10 unique job UUIDs without processing them', async () => {
    const request = vi.fn()
    const result = await handleServiceM8JobWebhook({
      url: 'https://rgtools.example/api/servicem8/job?token=webhook-secret',
      headers: new Headers(),
      body: {
        object: 'job',
        entry: Array.from({ length: 11 }, (_, index) => ({ uuid: `job-uuid-${index}` })),
      },
      deps: { secret: 'webhook-secret', request },
    })

    expect(result).toEqual({ status: 413, body: { error: 'Too many webhook entries' } })
    expect(request).not.toHaveBeenCalled()
  })
})
