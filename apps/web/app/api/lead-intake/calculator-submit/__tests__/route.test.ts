import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// `after()` only has a request scope when invoked by the Next runtime; in this
// direct-call unit test we stub it to run the scheduled callback immediately.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (callback: () => void) => { callback() } }
})

const submitLeadIntakeForUserMock = vi.hoisted(() => vi.fn())
const checkLeadSubmitRateLimitMock = vi.hoisted(() => vi.fn())
const verifyTurnstileTokenMock = vi.hoisted(() => vi.fn())
const sendCustomerEstimateEmailMock = vi.hoisted(() => vi.fn())
const syncLeadToServiceM8Mock = vi.hoisted(() => vi.fn())
const saveLeadSubmitFailureMock = vi.hoisted(() => vi.fn())
const findCalculatorLeadBySubmissionRefMock = vi.hoisted(() => vi.fn())
const hasCompletedCustomerEstimateEmailMock = vi.hoisted(() => vi.fn())

vi.mock('@/modules/lead-intake/actions', () => ({
  submitLeadIntakeForUser: submitLeadIntakeForUserMock,
}))

vi.mock('@/modules/lead-intake/anti-spam/rate-limit', () => ({
  checkLeadSubmitRateLimit: checkLeadSubmitRateLimitMock,
}))

vi.mock('@/modules/lead-intake/anti-spam/verify-turnstile', () => ({
  verifyTurnstileToken: verifyTurnstileTokenMock,
}))

vi.mock('@/modules/lead-intake/email/customer-estimate', () => ({
  sendCustomerEstimateEmail: sendCustomerEstimateEmailMock,
}))

vi.mock('@/modules/lead-intake/servicem8/sync', () => ({
  syncLeadToServiceM8: syncLeadToServiceM8Mock,
}))

vi.mock('@/modules/lead-intake/calculator/submit-failures', () => ({
  saveLeadSubmitFailure: saveLeadSubmitFailureMock,
}))

vi.mock('@/modules/lead-intake/calculator/idempotency', () => ({
  findCalculatorLeadBySubmissionRef: findCalculatorLeadBySubmissionRefMock,
  hasCompletedCustomerEstimateEmail: hasCompletedCustomerEstimateEmailMock,
}))

import { OPTIONS, POST } from '../route'

const validPayload = {
  answers: {
    scenario: 'premium_pool_fence',
    length: 12,
    corners: 2,
    gates: 1,
    fixing: 'spigot_round',
    substrate: 'concrete',
    hardware: 'standard_chrome',
  },
  lead: {
    firstName: 'Sarah',
    lastName: 'Johnson',
    phone: '021 123 4567',
    email: 'sarah@example.com',
    customerType: 'homeowner',
    timeframe: 'asap',
    address: '12 Beach Rd, Takapuna',
    callPreference: 'anytime',
    notes: '',
    consent: true,
    websiteUrl: '',
  },
  estimate: {
    low: 4100,
    high: 5400,
    subtotal: 4800,
    needsCallUs: false,
    consultationFlags: [],
  },
  loadedAt: Date.now() - 5000,
  turnstileToken: 'token',
  submissionRef: 'rgcalc_test_ref123',
}

function request(body: unknown = validPayload, origin = 'https://www.royalglass.co.nz') {
  return new NextRequest('http://localhost/api/lead-intake/calculator-submit', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10, 10.0.0.2',
    },
    body: JSON.stringify(body),
  })
}

function serverRequest(body: unknown = validPayload, secret = 'wordpress-forward-secret') {
  return new NextRequest('http://localhost/api/lead-intake/calculator-submit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10, 10.0.0.2',
      'x-rg-calculator-secret': secret,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CALCULATOR_ALLOWED_ORIGIN = 'https://royalglass.co.nz, https://www.royalglass.co.nz, https://rgtools.co.nz, https://www.rgtools.co.nz'
  process.env.CALCULATOR_SUBMIT_SECRET = 'wordpress-forward-secret'
  submitLeadIntakeForUserMock.mockResolvedValue({
    success: true,
    leadId: 'lead-uuid',
    clientId: 'client-uuid',
    matchedExistingClient: false,
    score: 64,
    tier: 'B',
    reason: 'Good fit',
    completeness: 80,
    distanceBand: 'within_30km',
    flagNote: null,
    servicem8Sync: { ok: true, leadId: 'lead-uuid', reference: 'deferred' },
  })
  checkLeadSubmitRateLimitMock.mockResolvedValue({ ok: true, remaining: 9 })
  verifyTurnstileTokenMock.mockResolvedValue({ ok: true, skipped: false })
  sendCustomerEstimateEmailMock.mockResolvedValue({ ok: true })
  syncLeadToServiceM8Mock.mockResolvedValue({ ok: true, leadId: 'lead-uuid', reference: 'RGTools Lead lead-uuid' })
  saveLeadSubmitFailureMock.mockResolvedValue(undefined)
  findCalculatorLeadBySubmissionRefMock.mockResolvedValue(null)
  hasCompletedCustomerEstimateEmailMock.mockResolvedValue(false)
})

describe('OPTIONS /api/lead-intake/calculator-submit', () => {
  it('returns a CORS preflight for the configured calculator origin', async () => {
    const response = await OPTIONS(request())

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://www.royalglass.co.nz')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('returns a CORS preflight for the rgtools calculator origin', async () => {
    const response = await OPTIONS(request(validPayload, 'https://www.rgtools.co.nz'))

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://www.rgtools.co.nz')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('keeps rgtools allowed when env is still configured for a single Royal Glass origin', async () => {
    process.env.CALCULATOR_ALLOWED_ORIGIN = 'https://www.royalglass.co.nz'

    const response = await OPTIONS(request(validPayload, 'https://www.rgtools.co.nz'))

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://www.rgtools.co.nz')
  })
})

describe('POST /api/lead-intake/calculator-submit', () => {
  it('starts the customer email while ServiceM8 sync is still pending', async () => {
    let finishSync!: (value: { ok: true; leadId: string; reference: string }) => void
    syncLeadToServiceM8Mock.mockReturnValue(new Promise((resolve) => {
      finishSync = resolve
    }))

    try {
      const response = await POST(serverRequest())

      expect(response.status).toBe(200)
      expect(syncLeadToServiceM8Mock).toHaveBeenCalledWith('lead-uuid')
      expect(sendCustomerEstimateEmailMock).toHaveBeenCalledWith(expect.objectContaining({
        leadId: 'lead-uuid',
        to: 'sarah@example.com',
      }))
    } finally {
      finishSync({ ok: true, leadId: 'lead-uuid', reference: 'RGTools Lead lead-uuid' })
    }
  })

  it('saves the lead, returns its UUID, and starts email without awaiting it', async () => {
    const neverSettlingEmail = new Promise(() => undefined)
    sendCustomerEstimateEmailMock.mockReturnValue(neverSettlingEmail)

    const response = await POST(request())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://www.royalglass.co.nz')
    expect(json).toEqual({ ok: true, leadId: 'lead-uuid', submissionRef: 'rgcalc_test_ref123' })
    expect(submitLeadIntakeForUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'calculator',
        projectType: 'pool_fence',
        jobDescription: expect.stringContaining('[Calculator] submitted'),
        leadSource: 'website_google_walk_in_cold_lead',
        cat4: '',
        externalRef: 'rgcalc_test_ref123',
      }),
      null,
      { syncServiceM8: false },
    )
    expect(sendCustomerEstimateEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'lead-uuid',
      to: 'sarah@example.com',
    }))
    // ServiceM8 sync runs in the background (after response) so the lead reaches
    // the SM8 inbox without depending on a cron/retry batch.
    expect(syncLeadToServiceM8Mock).toHaveBeenCalledWith('lead-uuid')
  })

  it('accepts calculator submissions from the rgtools production origin', async () => {
    const response = await POST(request(validPayload, 'https://www.rgtools.co.nz'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://www.rgtools.co.nz')
    expect(json).toEqual({ ok: true, leadId: 'lead-uuid', submissionRef: 'rgcalc_test_ref123' })
    expect(submitLeadIntakeForUserMock).toHaveBeenCalled()
  })

  it('accepts trusted WordPress server forwards without browser CORS or Turnstile', async () => {
    verifyTurnstileTokenMock.mockResolvedValue({ ok: false, reason: 'missing-token' })
    checkLeadSubmitRateLimitMock.mockResolvedValue({ ok: false, retryAfterSeconds: 3600 })

    const response = await POST(serverRequest({
      ...validPayload,
      turnstileToken: '',
      lead: {
        ...validPayload.lead,
        notes: 'Forwarded from WordPress after same-origin calculator submit',
      },
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(json).toEqual({ ok: true, leadId: 'lead-uuid', submissionRef: 'rgcalc_test_ref123' })
    expect(verifyTurnstileTokenMock).not.toHaveBeenCalled()
    expect(checkLeadSubmitRateLimitMock).not.toHaveBeenCalled()
    expect(submitLeadIntakeForUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'calculator',
        externalRef: 'rgcalc_test_ref123',
        jobDescription: expect.stringContaining('Forwarded from WordPress after same-origin calculator submit'),
      }),
      null,
      { syncServiceM8: false },
    )
  })

  it('rejects server forwards with a bad shared secret', async () => {
    const response = await POST(serverRequest(validPayload, 'wrong-secret'))

    expect(response.status).toBe(403)
    expect(submitLeadIntakeForUserMock).not.toHaveBeenCalled()
  })

  it('rejects disallowed CORS origins before processing the body', async () => {
    const response = await POST(request(validPayload, 'https://evil.example'))

    expect(response.status).toBe(403)
    expect(submitLeadIntakeForUserMock).not.toHaveBeenCalled()
  })

  it('rejects honeypot submissions', async () => {
    const response = await POST(request({
      ...validPayload,
      lead: { ...validPayload.lead, websiteUrl: 'https://spam.example' },
    }))

    expect(response.status).toBe(403)
    expect(submitLeadIntakeForUserMock).not.toHaveBeenCalled()
    expect(saveLeadSubmitFailureMock).not.toHaveBeenCalled()
  })

  it('rejects submissions that arrive too quickly after load', async () => {
    const response = await POST(request({ ...validPayload, loadedAt: Date.now() - 1000 }))

    expect(response.status).toBe(403)
    expect(submitLeadIntakeForUserMock).not.toHaveBeenCalled()
  })

  it('rejects failed Turnstile verification', async () => {
    verifyTurnstileTokenMock.mockResolvedValue({ ok: false, reason: 'invalid-input-response' })

    const response = await POST(request())

    expect(response.status).toBe(403)
    expect(submitLeadIntakeForUserMock).not.toHaveBeenCalled()
  })

  it('rejects rate-limited IPs', async () => {
    checkLeadSubmitRateLimitMock.mockResolvedValue({ ok: false, retryAfterSeconds: 3600 })

    const response = await POST(request())

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('3600')
    expect(submitLeadIntakeForUserMock).not.toHaveBeenCalled()
  })

  it('dead-letters valid prospect payloads when the Neon save path fails', async () => {
    submitLeadIntakeForUserMock.mockResolvedValue({ error: 'Email is required.' })

    const response = await POST(request())
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Unable to submit lead')
    expect(saveLeadSubmitFailureMock).toHaveBeenCalledWith(expect.objectContaining({
      ip: '203.0.113.10',
      stage: 'save',
      error: 'Email is required.',
      payload: validPayload,
      submissionRef: 'rgcalc_test_ref123',
    }))
  })

  it('accepts a provisional phone collision into contact review and still schedules email and ServiceM8', async () => {
    const databaseError = Object.assign(new Error('duplicate key contains private contact values'), {
      code: '23505',
      constraint: 'clients_phone_normalized_provisional_uq',
    })
    submitLeadIntakeForUserMock.mockRejectedValueOnce(
      new Error('Failed query contains private contact values', { cause: databaseError }),
    )
    submitLeadIntakeForUserMock.mockResolvedValueOnce({
      success: true,
      leadId: 'review-lead-uuid',
      clientId: 'review-client-uuid',
      matchedExistingClient: false,
      score: 64,
      tier: 'B',
      reason: 'Good fit',
      completeness: 80,
      distanceBand: 'within_30km',
      flagNote: null,
      servicem8Sync: { ok: true, leadId: 'review-lead-uuid', reference: 'deferred' },
      contactReviewReason: 'Contact details need checking: phone matches a different provisional client.',
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const response = await POST(serverRequest())
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        ok: true,
        leadId: 'review-lead-uuid',
        submissionRef: 'rgcalc_test_ref123',
      })
      expect(submitLeadIntakeForUserMock).toHaveBeenCalledTimes(2)
      expect(submitLeadIntakeForUserMock).toHaveBeenLastCalledWith(
        expect.anything(), null,
        expect.objectContaining({
          syncServiceM8: false,
          forceContactReview: true,
        }),
      )
      expect(syncLeadToServiceM8Mock).toHaveBeenCalledWith('review-lead-uuid')
      expect(sendCustomerEstimateEmailMock).toHaveBeenCalledWith(expect.objectContaining({
        leadId: 'review-lead-uuid',
      }))
      expect(saveLeadSubmitFailureMock).not.toHaveBeenCalled()
      const messages = log.mock.calls.map(([message]) => String(message)).join('\n')
      expect(messages).toContain('clients_phone_normalized_provisional_uq')
      expect(messages).toContain('23505')
      expect(messages).not.toContain('private contact values')
      expect(messages).not.toContain('sarah@example.com')
      expect(messages).not.toContain('021 123 4567')
    } finally {
      log.mockRestore()
    }
  })

  it('records a failed contact-review retry so WordPress can retain the submission for recovery', async () => {
    const databaseError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'clients_phone_normalized_provisional_uq',
    })
    submitLeadIntakeForUserMock
      .mockRejectedValueOnce(new Error('Failed query', { cause: databaseError }))
      .mockRejectedValueOnce(new Error('Review save unavailable'))

    const response = await POST(serverRequest())

    expect(response.status).toBe(500)
    expect(saveLeadSubmitFailureMock).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'save',
      error: 'unexpected_save_failure',
      submissionRef: 'rgcalc_test_ref123',
    }))
    expect(sendCustomerEstimateEmailMock).not.toHaveBeenCalled()
    expect(syncLeadToServiceM8Mock).not.toHaveBeenCalled()
  })

  it('keeps unexpected save failures diagnosable without logging their raw message', async () => {
    submitLeadIntakeForUserMock.mockRejectedValue(new TypeError('private contact values in failure'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const response = await POST(serverRequest())
      expect(response.status).toBe(500)
      const messages = log.mock.calls.map(([message]) => String(message)).join('\n')
      expect(messages).toContain('unexpected_save_failure')
      expect(messages).toContain('"errorType":"TypeError"')
      expect(messages).not.toContain('private contact values')
    } finally {
      log.mockRestore()
    }
  })

  it('creates a stable fallback submission reference for older calculator payloads', async () => {
    const legacyPayload: Record<string, unknown> = { ...validPayload }
    delete legacyPayload.submissionRef

    const response = await POST(request(legacyPayload))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      ok: true,
      leadId: 'lead-uuid',
      submissionRef: expect.stringMatching(/^calculator:/),
    })
    expect(submitLeadIntakeForUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'calculator',
        externalRef: expect.stringMatching(/^calculator:/),
      }),
      null,
      { syncServiceM8: false },
    )
  })

  it('resumes customer email and ServiceM8 for an existing lead after a trusted retry', async () => {
    findCalculatorLeadBySubmissionRefMock.mockResolvedValue({ leadId: 'existing-lead-uuid' })

    const response = await POST(serverRequest({
      ...validPayload,
      lead: {
        ...validPayload.lead,
        email: 'same-customer@example.com',
      },
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      ok: true,
      leadId: 'existing-lead-uuid',
      submissionRef: 'rgcalc_test_ref123',
      idempotent: true,
    })
    expect(findCalculatorLeadBySubmissionRefMock).toHaveBeenCalledWith('rgcalc_test_ref123')
    expect(submitLeadIntakeForUserMock).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(sendCustomerEstimateEmailMock).toHaveBeenCalledWith(expect.objectContaining({
        leadId: 'existing-lead-uuid',
        to: 'same-customer@example.com',
      }))
      expect(syncLeadToServiceM8Mock).toHaveBeenCalledWith('existing-lead-uuid')
    })
    expect(saveLeadSubmitFailureMock).not.toHaveBeenCalled()
  })

  it('does not resend a completed customer email when resuming ServiceM8 for an existing lead', async () => {
    findCalculatorLeadBySubmissionRefMock.mockResolvedValue({ leadId: 'existing-lead-uuid' })
    hasCompletedCustomerEstimateEmailMock.mockResolvedValue(true)

    const response = await POST(serverRequest())

    expect(response.status).toBe(200)
    await vi.waitFor(() => {
      expect(syncLeadToServiceM8Mock).toHaveBeenCalledWith('existing-lead-uuid')
    })
    expect(hasCompletedCustomerEstimateEmailMock).toHaveBeenCalledWith(
      'existing-lead-uuid',
      'sarah@example.com',
    )
    expect(sendCustomerEstimateEmailMock).not.toHaveBeenCalled()
    expect(submitLeadIntakeForUserMock).not.toHaveBeenCalled()
  })
})
