import { describe, expect, it, vi } from 'vitest'

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (callback: () => void) => { callback() } }
})

const handleServiceM8JobWebhookMock = vi.hoisted(() => vi.fn())
const isServiceM8JobWebhookAuthorizedMock = vi.hoisted(() => vi.fn(() => true))

vi.mock('@/modules/leads/servicem8-job-webhook', () => ({
  handleServiceM8JobWebhook: handleServiceM8JobWebhookMock,
  isServiceM8JobWebhookAuthorized: isServiceM8JobWebhookAuthorizedMock,
}))

import { POST } from '../route'

describe('POST /api/servicem8/job', () => {
  it('rejects an unauthorized callback before reading its body', async () => {
    isServiceM8JobWebhookAuthorizedMock.mockReturnValueOnce(false)
    const json = vi.fn(() => {
      throw new Error('body must not be read')
    })
    const request = {
      url: 'https://rgtools.example/api/servicem8/job',
      headers: new Headers(),
      json,
    } as unknown as Request

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(json).not.toHaveBeenCalled()
    expect(handleServiceM8JobWebhookMock).not.toHaveBeenCalled()
  })

  it('rejects an authenticated callback larger than 64 KiB', async () => {
    const request = new Request('https://rgtools.example/api/servicem8/job?token=secret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'job.created', padding: 'x'.repeat(65_536) }),
    })

    const response = await POST(request)

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ error: 'Payload too large' })
    expect(handleServiceM8JobWebhookMock).not.toHaveBeenCalled()
  })

  it('acknowledges a ServiceM8 job webhook after reconciliation', async () => {
    handleServiceM8JobWebhookMock.mockResolvedValue({
      status: 200,
      body: { ok: true, processed: 1 },
    })
    const request = new Request('https://rgtools.example/api/servicem8/job?token=secret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        object: 'job',
        entry: [{ uuid: 'job-uuid-2', changed_fields: ['generated_job_id'] }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, processed: 1 })
    expect(handleServiceM8JobWebhookMock).toHaveBeenCalledWith(expect.objectContaining({
      url: request.url,
      headers: request.headers,
      body: expect.objectContaining({ object: 'job' }),
    }))
  })

  it('decodes a form-encoded event webhook payload', async () => {
    handleServiceM8JobWebhookMock.mockResolvedValue({
      status: 200,
      body: { ok: true, processed: 1 },
    })
    const jobUuid = '01a11890-73f9-7dbb-a2ab-35ed36ed866b'
    const request = new Request('https://rgtools.example/api/servicem8/job?token=secret', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        type: 'job.created',
        createdAt: '2026-10-08T11:51:26+13:00',
        data: JSON.stringify({ uuid: jobUuid }),
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(handleServiceM8JobWebhookMock).toHaveBeenCalledWith(expect.objectContaining({
      body: {
        type: 'job.created',
        createdAt: '2026-10-08T11:51:26+13:00',
        data: { uuid: jobUuid },
      },
    }))
  })
})
