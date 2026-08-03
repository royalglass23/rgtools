import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const insertValuesMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({ values: insertValuesMock })),
  },
}))

import { sendCustomerEstimateEmail } from '../customer-estimate'

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key')
  vi.stubEnv('RESEND_FROM', 'Royal Glass <estimates@example.com>')
  insertValuesMock.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

async function sendAndCaptureHtml(): Promise<string> {
  const fetchFn = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'email-1' }),
  })

  await sendCustomerEstimateEmail({
    leadId: 'lead-1',
    to: 'customer@example.com',
    customerName: 'Taylor',
    estimate: {
      low: 12_345,
      high: 67_890,
      subtotal: null,
      needsCallUs: false,
      consultationFlags: [],
    },
    projectType: 'balcony_balustrade',
    answers: { length: 36 },
    correlationId: 'correlation-1',
    fetchFn: fetchFn as typeof fetch,
  })

  const request = fetchFn.mock.calls[0]?.[1]
  const body = JSON.parse(String(request?.body)) as { html: string }
  return body.html
}

describe('sendCustomerEstimateEmail', () => {
  it('keeps the estimate readable when an email client ignores CSS gradients', async () => {
    const html = await sendAndCaptureHtml()

    expect(html).toMatch(
      /<td[^>]*bgcolor="#1a3c5e"[^>]*>[\s\S]*?\$12,345 &ndash; \$67,890[\s\S]*?<\/td>/,
    )
  })

  it('keeps the email card bounded when an email client ignores CSS max-width', async () => {
    const html = await sendAndCaptureHtml()

    expect(html).toMatch(
      /<table[^>]*role="presentation"[^>]*width="600"[^>]*style="[^"]*width:600px;[^"]*max-width:100%;[^"]*">/,
    )
  })

  it('keeps the call action visually distinct when link backgrounds are ignored', async () => {
    const html = await sendAndCaptureHtml()

    expect(html).toMatch(
      /<!-- CTA -->[\s\S]*?<td[^>]*bgcolor="#1a3c5e"[^>]*>[\s\S]*?<a href="tel:0800769254"[^>]*>Call us: 0800 769 254<\/a>/,
    )
  })
})
