// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createServiceM8RequestFromEnv,
  createServiceM8WriteRequestFromEnv,
  getCompanyContact,
  getJobConversationSnapshotHistory,
  getJobContact,
  getJobLookupByNumber,
  getJobNotesAndEmails,
  getJobQuoteMeta,
  resolveJobUuid,
  ServiceM8RateLimitError,
  setJobLeadCardFields,
  setJobLeadsQuality,
  stripEmailNoise,
  withServiceM8Retry,
  type ServiceM8FetchRequest,
} from '../client'

describe('createServiceM8RequestFromEnv', () => {
  const originalApiKey = process.env.SERVICEM8_API_KEY
  const originalBaseUrl = process.env.SERVICEM8_API_BASE_URL

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.SERVICEM8_API_KEY
    else process.env.SERVICEM8_API_KEY = originalApiKey
    if (originalBaseUrl === undefined) delete process.env.SERVICEM8_API_BASE_URL
    else process.env.SERVICEM8_API_BASE_URL = originalBaseUrl
    vi.unstubAllGlobals()
  })

  it('supports a controlled ServiceM8 adapter endpoint', async () => {
    process.env.SERVICEM8_API_KEY = 'e2e-read-key'
    process.env.SERVICEM8_API_BASE_URL = 'http://127.0.0.1:32199/api_1.0/'
    const fetchMock = vi.fn(async () => Response.json([]))
    vi.stubGlobal('fetch', fetchMock)

    await createServiceM8RequestFromEnv()('/job.json')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:32199/api_1.0/job.json',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
  })

  it('preserves the ServiceM8 pagination cursor header', async () => {
    process.env.SERVICEM8_API_KEY = 'e2e-read-key'
    const fetchMock = vi.fn(async () => Response.json([], {
      headers: { 'x-next-cursor': 'cursor-2' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await createServiceM8RequestFromEnv()('/job.json?cursor=-1')

    expect(response.headers?.get('x-next-cursor')).toBe('cursor-2')
  })
})

describe('withServiceM8Retry', () => {
  it('retries a throttled request and returns the eventual success', async () => {
    const request = vi.fn<ServiceM8FetchRequest>()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ uuid: 'job-uuid-1' }] })
    const sleeps: number[] = []

    const response = await withServiceM8Retry(request, {
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      random: () => 0.5,
    })('/job.json')

    await expect(response.json()).resolves.toEqual([{ uuid: 'job-uuid-1' }])
    expect(request).toHaveBeenCalledTimes(2)
    expect(sleeps).toEqual([500])
  })

  it('throws a typed error after retryable responses are exhausted', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    }))
    const sleeps: number[] = []

    await expect(withServiceM8Retry(request, {
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      random: () => 1,
      maxAttempts: 3,
    })('/job.json')).rejects.toBeInstanceOf(ServiceM8RateLimitError)

    expect(request).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([1000, 2000])
  })

  it('does not retry non-retryable client errors', async () => {
    const response = { ok: false, status: 404, json: async () => ({}) }
    const request = vi.fn<ServiceM8FetchRequest>(async () => response)
    const sleep = vi.fn(async () => undefined)

    await expect(withServiceM8Retry(request, { sleep })('/company/missing.json')).resolves.toBe(response)

    expect(request).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })

  it('retries a network error and returns the eventual success', async () => {
    const request = vi.fn<ServiceM8FetchRequest>()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })
    const sleep = vi.fn(async () => undefined)

    const response = await withServiceM8Retry(request, { sleep })('/job.json')

    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(request).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledOnce()
  })
})

describe('getJobContact', () => {
  it('returns the richest active contact for a ServiceM8 job', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { name: 'Inactive', phone: '111', active: 0 },
        { first: 'Roxy', last: 'Glass', phone: '09 123', mobile: '021 456', email: 'roxy@example.test', active: 1 },
      ],
    }))

    await expect(getJobContact('job-uuid-1', request)).resolves.toEqual({
      name: 'Roxy Glass',
      phone: '09 123',
      mobile: '021 456',
      email: 'roxy@example.test',
    })
    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0]?.[0]).toContain('/jobcontact.json?%24filter=')
    expect(decodeURIComponent(request.mock.calls[0]?.[0] ?? '')).toContain("job_uuid eq 'job-uuid-1'")
  })

  it('merges usable email and phone details across active job contacts', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { first: 'Billing', email: '', phone: '021 311999', mobile: '021 311999', type: 'BILLING', active: 1 },
        { first: 'Paul', email: 'info@tailoredbuilding.co.nz', phone: 'https://example.test/', mobile: '', type: 'JOB', active: 1 },
      ],
    }))

    await expect(getJobContact('job-uuid-1', request)).resolves.toEqual({
      name: 'Paul',
      phone: '021 311999',
      mobile: '021 311999',
      email: 'info@tailoredbuilding.co.nz',
    })
  })
})

describe('getCompanyContact', () => {
  it('returns the richest active company contact', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async (path) => {
      expect(path).toContain('/companycontact.json?%24filter=')
      return {
        ok: true,
        status: 200,
        json: async () => [
          { name: 'No details', active: 1 },
          { name: 'Darin', mobile: '027 111 222', email: 'darin@example.test', active: 1 },
        ],
      }
    })

    await expect(getCompanyContact('company-uuid-1', request)).resolves.toEqual({
      name: 'Darin',
      phone: null,
      mobile: '027 111 222',
      email: 'darin@example.test',
    })
  })

  it('falls back to the company record when company contacts are empty', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async (path) => {
      if (path.startsWith('/companycontact.json')) {
        return { ok: true, status: 200, json: async () => [] }
      }
      expect(path).toBe('/company/company-uuid-1.json')
      return {
        ok: true,
        status: 200,
        json: async () => ({ name: 'Access', phone: '09 123', email: 'office@example.test' }),
      }
    })

    await expect(getCompanyContact('company-uuid-1', request)).resolves.toEqual({
      name: 'Access',
      phone: '09 123',
      mobile: null,
      email: 'office@example.test',
    })
  })
})

describe('getJobQuoteMeta', () => {
  const originalClientTypeField = process.env.SERVICEM8_CLIENT_TYPE_FIELD
  const originalProjectTypeField = process.env.SERVICEM8_PROJECT_TYPE_FIELD
  const originalNoteField = process.env.SERVICEM8_NOTE_FIELD

  afterEach(() => {
    if (originalClientTypeField === undefined) {
      delete process.env.SERVICEM8_CLIENT_TYPE_FIELD
    } else {
      process.env.SERVICEM8_CLIENT_TYPE_FIELD = originalClientTypeField
    }
    if (originalProjectTypeField === undefined) {
      delete process.env.SERVICEM8_PROJECT_TYPE_FIELD
    } else {
      process.env.SERVICEM8_PROJECT_TYPE_FIELD = originalProjectTypeField
    }
    if (originalNoteField === undefined) {
      delete process.env.SERVICEM8_NOTE_FIELD
    } else {
      process.env.SERVICEM8_NOTE_FIELD = originalNoteField
    }
  })

  it('returns configured RG lead job-card fields from the ServiceM8 job card', async () => {
    process.env.SERVICEM8_CLIENT_TYPE_FIELD = 'customfield_client_type'
    process.env.SERVICEM8_PROJECT_TYPE_FIELD = 'customfield_project_type'
    process.env.SERVICEM8_NOTE_FIELD = 'customfield_note'
    const request = vi.fn<ServiceM8FetchRequest>(async (path) => {
      if (path === '/job/job-uuid-1.json') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            uuid: 'job-uuid-1',
            generated_job_id: 'Q260010',
            status: 'Quote',
            job_description: 'Balustrade quote',
            job_address: '10 Glass Lane',
            company_uuid: null,
            total_invoice_amount: '12000.00',
            customfield_client_type: 'Builder / Developer / Pool Builder / Landscaper',
            customfield_project_type: 'New Build / Commercial Fit-out',
            customfield_note: 'Project Type: New Build / Commercial Fit-out',
          }),
        }
      }

      if (path.startsWith('/jobmaterial.json')) {
        return { ok: true, status: 200, json: async () => [] }
      }

      throw new Error(`Unexpected request path: ${path}`)
    })

    await expect(getJobQuoteMeta('job-uuid-1', request)).resolves.toMatchObject({
      jobUuid: 'job-uuid-1',
      quoteValue: '12000.00',
      leadJobCardFields: {
        clientType: 'Builder / Developer / Pool Builder / Landscaper',
        projectType: 'New Build / Commercial Fit-out',
        note: 'Project Type: New Build / Commercial Fit-out',
      },
    })
  })

  it('looks up a ServiceM8 job by human job number for PS Generator prefill', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async (path) => {
      if (path.startsWith('/job.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            uuid: 'job-uuid-1',
            generated_job_id: 'R260210',
            job_address: '10 Glass Lane',
            company_uuid: 'company-uuid-1',
          }],
        }
      }

      if (path === '/company/company-uuid-1.json') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: 'Jane Customer' }),
        }
      }

      throw new Error(`Unexpected request path: ${path}`)
    })

    await expect(getJobLookupByNumber(' r260210 ', request)).resolves.toEqual({
      jobNumber: 'R260210',
      clientName: 'Jane Customer',
      jobAddress: '10 Glass Lane',
    })
    expect(decodeURIComponent(request.mock.calls[0][0])).toContain("generated_job_id eq 'R260210'")
  })
})

describe('getJobNotesAndEmails', () => {
  it('returns trimmed notes and emails for a ServiceM8 job', async () => {
    const longNote = 'n'.repeat(2000)
    const request = vi.fn<ServiceM8FetchRequest>(async (path) => {
      if (path.startsWith('/note.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { edit_date: '2026-06-10T09:00:00Z', note: 'older note' },
            { edit_date: '2026-06-15T09:00:00Z', note: longNote },
            { edit_date: '2026-06-14T09:00:00Z', note: 'note 2' },
            { edit_date: '2026-06-13T09:00:00Z', note: 'note 3' },
            { edit_date: '2026-06-12T09:00:00Z', note: 'note 4' },
            { edit_date: '2026-06-11T09:00:00Z', note: 'note 5' },
          ],
        }
      }

      if (path.startsWith('/email.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              edit_date: '2026-06-09T09:00:00Z',
              subject: 'Oldest email',
              message_text: 'drop me',
            },
            {
              edit_date: '2026-06-12T09:00:00Z',
              subject: 'Site measure',
              message_html: '<p>Hello <strong>Royal Glass</strong></p><p>Please measure.</p>',
            },
            {
              edit_date: '2026-06-11T09:00:00Z',
              subject: 'Quote timing',
              message_text: 'Can you quote this week?',
            },
            {
              edit_date: '2026-06-10T09:00:00Z',
              subject: 'Photos',
              message_text: 'Photos attached.',
            },
          ],
        }
      }

      return { ok: false, status: 404, json: async () => null }
    })

    await expect(getJobNotesAndEmails('job-uuid-1', request)).resolves.toEqual({
      notes: [
        { date: '2026-06-15T09:00:00Z', text: `${'n'.repeat(297)}...` },
        { date: '2026-06-14T09:00:00Z', text: 'note 2' },
        { date: '2026-06-13T09:00:00Z', text: 'note 3' },
        { date: '2026-06-12T09:00:00Z', text: 'note 4' },
        { date: '2026-06-11T09:00:00Z', text: 'note 5' },
        { date: '2026-06-10T09:00:00Z', text: 'older note' },
      ],
      emails: [
        {
          date: '2026-06-12T09:00:00Z',
          subject: 'Site measure',
          body: 'Hello Royal Glass Please measure.',
          direction: null,
        },
        {
          date: '2026-06-11T09:00:00Z',
          subject: 'Quote timing',
          body: 'Can you quote this week?',
          direction: null,
        },
        {
          date: '2026-06-10T09:00:00Z',
          subject: 'Photos',
          body: 'Photos attached.',
          direction: null,
        },
        {
          date: '2026-06-09T09:00:00Z',
          subject: 'Oldest email',
          body: 'drop me',
          direction: null,
        },
      ],
    })

    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[0]?.[0]).toContain('/note.json?%24filter=')
    expect(request.mock.calls[1]?.[0]).toContain('/email.json?%24filter=')
    expect(decodeURIComponent(request.mock.calls[0]?.[0] ?? '')).toContain("related_object_uuid eq 'job-uuid-1'")
    expect(decodeURIComponent(request.mock.calls[1]?.[0] ?? '')).toContain("related_object_uuid eq 'job-uuid-1'")
  })

  it('drops link-only, @mention, and bare-number notes so real signal fills the slots', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async (path) => {
      if (path.startsWith('/note.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { edit_date: '2026-06-15T09:00:00Z', note: 'https://drive.google.com/drive/folders/abc123' },
            { edit_date: '2026-06-14T09:00:00Z', note: '@Roxy' },
            { edit_date: '2026-06-13T09:00:00Z', note: '69870+gst' },
            { edit_date: '2026-06-12T09:00:00Z', note: 'consented plans almost done, job around August' },
            { edit_date: '2026-06-11T09:00:00Z', note: '167 Princes Street East: https://1drv.ms/f/xyz' },
          ],
        }
      }
      return { ok: true, status: 200, json: async () => [] }
    })

    const history = await getJobNotesAndEmails('job-uuid-1', request)
    expect(history.notes).toEqual([
      { date: '2026-06-12T09:00:00Z', text: 'consented plans almost done, job around August' },
      { date: '2026-06-11T09:00:00Z', text: '167 Princes Street East:' },
    ])
  })

  it('prioritises inbound (customer) emails over outbound boilerplate within the cap', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async (path) => {
      if (path.startsWith('/email.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { timestamp: '2026-06-18T09:00:00Z', direction: 'outbound', subject: 'Quote sent', message_text: 'Thanks for the opportunity.' },
            { timestamp: '2026-06-17T09:00:00Z', direction: 'outbound', subject: 'Reminder', message_text: 'Following up on our quote.' },
            { timestamp: '2026-06-16T09:00:00Z', direction: 'outbound', subject: 'Another reminder', message_text: 'Just checking in.' },
            { timestamp: '2026-06-15T09:00:00Z', direction: 'outbound', subject: 'Yet another', message_text: 'Still keen?' },
            { timestamp: '2026-06-10T09:00:00Z', direction: 'inbound', subject: 'Re: Quote', message_text: 'Can you do frameless instead?' },
          ],
        }
      }
      return { ok: true, status: 200, json: async () => [] }
    })

    const history = await getJobNotesAndEmails('job-uuid-1', request)
    // The customer's inbound email is retained despite being the oldest, and order stays newest-first.
    expect(history.emails.map((e) => e.direction)).toEqual(['outbound', 'outbound', 'outbound', 'inbound'])
    expect(history.emails.at(-1)).toEqual({
      date: '2026-06-10T09:00:00Z',
      subject: 'Re: Quote',
      body: 'Can you do frameless instead?',
      direction: 'inbound',
    })
  })

  it('returns empty history when ServiceM8 reads fail or return non-arrays', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async (path) => {
      if (path.startsWith('/note.json')) {
        return { ok: false, status: 500, json: async () => [{ note: 'ignored' }] }
      }

      return { ok: true, status: 200, json: async () => ({ rows: [] }) }
    })

    await expect(getJobNotesAndEmails('job-uuid-1', request)).resolves.toEqual({
      notes: [],
      emails: [],
    })
  })

  it('reports partial source status when one ServiceM8 history source fails', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async (path) => {
      if (path.startsWith('/note.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ edit_date: '2026-06-12T09:00:00Z', note: 'ready for follow-up' }],
        }
      }

      return { ok: false, status: 503, json: async () => ({ message: 'unavailable' }) }
    })

    await expect(getJobConversationSnapshotHistory('job-uuid-1', request)).resolves.toEqual({
      notes: [{ date: '2026-06-12T09:00:00Z', text: 'ready for follow-up' }],
      emails: [],
      sourceStatus: {
        notes: { ok: true, count: 1, latestTimestamp: '2026-06-12T09:00:00Z' },
        emails: {
          ok: false,
          count: 0,
          latestTimestamp: null,
          safeError: 'ServiceM8 email history fetch failed with HTTP 503.',
        },
      },
    })
  })

  it('propagates exhausted ServiceM8 retry errors instead of hiding them as empty history', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async () => {
      throw new ServiceM8RateLimitError(
        'ServiceM8 request failed after 5 attempts with HTTP 429',
        { path: '/note.json', status: 429, attempts: 5 },
      )
    })

    await expect(getJobNotesAndEmails('job-uuid-1', request)).rejects.toBeInstanceOf(ServiceM8RateLimitError)
  })
})

describe('stripEmailNoise', () => {
  it('strips HTML to readable text', () => {
    expect(stripEmailNoise('<p>Hello <strong>Jane</strong></p><p>Thanks &amp; bye.</p>'))
      .toBe('Hello Jane Thanks & bye.')
  })

  it('removes quoted reply chains and trailing signatures', () => {
    const body = [
      'Hi, please book the measure.',
      '',
      'Kind regards,',
      'Jane',
      '',
      'On Tue, Royal Glass wrote:',
      '> Previous message',
    ].join('\n')

    expect(stripEmailNoise(body)).toBe('Hi, please book the measure.')
  })
})

describe('resolveJobUuid', () => {
  it('returns null for a genuine empty ServiceM8 job search result', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }))

    await expect(resolveJobUuid({ jobNumber: 'R260227' }, request)).resolves.toBeNull()
  })

  it('propagates exhausted retry errors instead of reporting a missing job', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async () => {
      throw new ServiceM8RateLimitError(
        'ServiceM8 request failed after 5 attempts with HTTP 429',
        { path: '/job.json', status: 429, attempts: 5 },
      )
    })

    await expect(resolveJobUuid({ jobNumber: 'R260227' }, request)).rejects.toBeInstanceOf(ServiceM8RateLimitError)
  })
})

describe('setJobLeadsQuality', () => {
  const original = process.env.SERVICEM8_LEAD_QUALITY_FIELD

  afterEach(() => {
    process.env.SERVICEM8_LEAD_QUALITY_FIELD = original
  })

  it('posts the bare tier letter to the configured custom field for the job', async () => {
    process.env.SERVICEM8_LEAD_QUALITY_FIELD = 'customfield_leads_quality_'
    const calls: Array<{ path: string; init?: RequestInit }> = []
    const request: ServiceM8FetchRequest = async (path, init) => {
      calls.push({ path, init })
      return { ok: true, status: 200, json: async () => ({ errorCode: 0 }) }
    }

    await setJobLeadsQuality('job-uuid-1', 'A', request)

    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/job/job-uuid-1.json')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ customfield_leads_quality_: 'A' })
  })

  it('throws when the Leads Quality field is not configured', async () => {
    delete process.env.SERVICEM8_LEAD_QUALITY_FIELD
    const request: ServiceM8FetchRequest = async () => ({ ok: true, status: 200, json: async () => ({}) })

    await expect(setJobLeadsQuality('job-uuid-1', 'A', request)).rejects.toThrow(/SERVICEM8_LEAD_QUALITY_FIELD/)
  })

  it('throws when ServiceM8 rejects the write', async () => {
    process.env.SERVICEM8_LEAD_QUALITY_FIELD = 'customfield_leads_quality_'
    const request: ServiceM8FetchRequest = async () => ({ ok: false, status: 403, json: async () => ({}) })

    await expect(setJobLeadsQuality('job-uuid-1', 'A', request)).rejects.toThrow(/403/)
  })
})

describe('setJobLeadCardFields', () => {
  const originalLeadQuality = process.env.SERVICEM8_LEAD_QUALITY_FIELD
  const originalClientType = process.env.SERVICEM8_CLIENT_TYPE_FIELD
  const originalNote = process.env.SERVICEM8_NOTE_FIELD

  afterEach(() => {
    process.env.SERVICEM8_LEAD_QUALITY_FIELD = originalLeadQuality
    process.env.SERVICEM8_CLIENT_TYPE_FIELD = originalClientType
    process.env.SERVICEM8_NOTE_FIELD = originalNote
  })

  it('posts job description and configured custom fields to the job card', async () => {
    process.env.SERVICEM8_LEAD_QUALITY_FIELD = 'customfield_leads_quality_'
    process.env.SERVICEM8_CLIENT_TYPE_FIELD = 'customfield_client_type_'
    process.env.SERVICEM8_NOTE_FIELD = 'customfield_note_'
    const calls: Array<{ path: string; init?: RequestInit }> = []
    const request: ServiceM8FetchRequest = async (path, init) => {
      calls.push({ path, init })
      return { ok: true, status: 200, json: async () => ({ errorCode: 0 }) }
    }

    const result = await setJobLeadCardFields('job-uuid-1', {
      jobDescription: 'Frameless pool fence',
      clientType: 'Builder / Developer / Pool Builder / Landscaper',
      leadsQuality: 'A',
      note: 'Leads Quality A | Score 92 | RGTools Lead lead-1',
    }, request)

    expect(result).toEqual({
      updated: ['jobDescription', 'clientType', 'leadsQuality', 'note'],
      skipped: [],
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/job/job-uuid-1.json')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      job_description: 'Frameless pool fence',
      customfield_client_type_: 'Builder / Developer / Pool Builder / Landscaper',
      customfield_leads_quality_: 'A',
      customfield_note_: 'Leads Quality A | Score 92 | RGTools Lead lead-1',
    })
  })

  it('skips unconfigured custom fields without blocking standard job description writes', async () => {
    delete process.env.SERVICEM8_LEAD_QUALITY_FIELD
    delete process.env.SERVICEM8_CLIENT_TYPE_FIELD
    delete process.env.SERVICEM8_NOTE_FIELD
    const calls: Array<{ path: string; init?: RequestInit }> = []
    const request: ServiceM8FetchRequest = async (path, init) => {
      calls.push({ path, init })
      return { ok: true, status: 200, json: async () => ({}) }
    }

    const result = await setJobLeadCardFields('job-uuid-1', {
      jobDescription: 'Glass balustrade',
      clientType: 'Homeowner',
      leadsQuality: 'B',
      note: 'Needs site measure',
    }, request)

    expect(result).toEqual({
      updated: ['jobDescription'],
      skipped: ['clientType', 'leadsQuality', 'note'],
    })
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      job_description: 'Glass balustrade',
    })
  })
})

describe('createServiceM8WriteRequestFromEnv', () => {
  const original = process.env.SERVICEM8_API_KEY_FULL

  afterEach(() => {
    process.env.SERVICEM8_API_KEY_FULL = original
    vi.unstubAllGlobals()
  })

  it('authenticates writes with the full-access API key', async () => {
    process.env.SERVICEM8_API_KEY_FULL = 'smk-full-access'
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const request = createServiceM8WriteRequestFromEnv()
    await request('/job/job-uuid-1.json', { method: 'POST', body: '{}' })

    const [, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit | undefined]
    const headers = new Headers(init?.headers)
    expect(headers.get('X-API-Key')).toBe('smk-full-access')
  })

  it('throws when the full-access key is not configured', () => {
    delete process.env.SERVICEM8_API_KEY_FULL
    expect(() => createServiceM8WriteRequestFromEnv()).toThrow(/SERVICEM8_API_KEY_FULL/)
  })
})

describe('MT-71: OData single-quote escaping in resolveJobUuid', () => {
  it('escapes a single quote in job number to prevent predicate injection', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }))

    await resolveJobUuid({ jobNumber: "R'INJECT" }, request)

    const calledPath = request.mock.calls[0]?.[0] ?? ''
    const decoded = decodeURIComponent(calledPath)
    expect(decoded).toContain("generated_job_id eq 'R''INJECT'")
    expect(decoded).not.toContain("eq 'R'INJECT'")
  })

  it('leaves valid job numbers unchanged', async () => {
    const request = vi.fn<ServiceM8FetchRequest>(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ uuid: 'job-uuid-1' }],
    }))

    const result = await resolveJobUuid({ jobNumber: 'R260210' }, request)

    const calledPath = request.mock.calls[0]?.[0] ?? ''
    const decoded = decodeURIComponent(calledPath)
    expect(decoded).toContain("generated_job_id eq 'R260210'")
    expect(result).toBe('job-uuid-1')
  })
})
