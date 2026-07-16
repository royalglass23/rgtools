// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateWorkOrderItemLabel, validateWorkOrderItemLabel } from '../item-labels'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('generateWorkOrderItemLabel', () => {
  it('returns one concise production label using the existing OpenAI configuration', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    vi.stubEnv('OPENAI_MODEL', 'test-openai-model')
    const request = vi.fn(async (...requestArguments: Parameters<typeof fetch>) => {
      void requestArguments
      return Response.json({
        output: [{ content: [{ type: 'output_text', text: 'Frameless shower screen, 1200 x 900 mm, chrome' }] }],
      })
    })

    await expect(generateWorkOrderItemLabel(
      'Supply and install frameless shower screen 1200 x 900 with chrome hardware',
      request,
    )).resolves.toBe('Frameless shower screen, 1200 x 900 mm, chrome')

    expect(request).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-openai-key' }),
    }))
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body))
    expect(body).toEqual(expect.objectContaining({
      model: 'test-openai-model',
      input: expect.stringContaining('Supply and install frameless shower screen'),
    }))
  })

  it('supports a controlled OpenAI adapter endpoint', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'e2e-openai-key')
    vi.stubEnv('OPENAI_RESPONSES_URL', 'http://127.0.0.1:32199/v1/responses')
    const request = vi.fn(async () => Response.json({ output_text: 'Controlled label' }))

    await expect(generateWorkOrderItemLabel('Controlled item', request)).resolves.toBe('Controlled label')

    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:32199/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('redacts the provider response body from non-success errors', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    const request = vi.fn(async () => new Response('provider secret body', { status: 502 }))

    try {
      await generateWorkOrderItemLabel('Controlled item', request)
      throw new Error('Expected OpenAI label generation to fail.')
    } catch (error) {
      expect(error).toEqual(new Error('OpenAI Work Order label generation failed with HTTP 502.'))
      expect(String(error)).not.toContain('provider secret body')
    }
  })

  it('aborts a stalled provider request after the configured timeout', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    vi.useFakeTimers()
    const request = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('request aborted'), { name: 'AbortError' }))
      })
    }))

    const result = generateWorkOrderItemLabel('Stalled item', request)
    const rejection = expect(result).rejects.toThrow('OpenAI Work Order label generation timed out.')
    await vi.advanceTimersByTimeAsync(30000)

    await rejection
    expect(request).toHaveBeenCalledOnce()
  })
})

describe('validateWorkOrderItemLabel', () => {
  it('rejects output containing multiple labels', () => {
    expect(() => validateWorkOrderItemLabel('Shower screen\nBalustrade panel')).toThrow(
      'OpenAI Work Order label response must contain exactly one label.',
    )
  })

  it('rejects output that is too long to be a concise production label', () => {
    expect(() => validateWorkOrderItemLabel('x'.repeat(161))).toThrow(
      'OpenAI Work Order label response must be 160 characters or fewer.',
    )
  })
})
