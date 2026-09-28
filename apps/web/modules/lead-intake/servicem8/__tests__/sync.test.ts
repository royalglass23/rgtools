import { beforeEach, describe, expect, it, vi } from 'vitest'

const selectLimit = vi.hoisted(() => vi.fn())
const selectBuilder = vi.hoisted(() => ({
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: selectLimit,
}))
const updateWhere = vi.hoisted(() => vi.fn())
const updateSet = vi.hoisted(() => vi.fn(() => ({ where: updateWhere })))
const update = vi.hoisted(() => vi.fn(() => ({ set: updateSet })))
const insertValues = vi.hoisted(() => vi.fn())
const insert = vi.hoisted(() => vi.fn(() => ({ values: insertValues })))
const dbMock = vi.hoisted(() => ({
  select: vi.fn(() => selectBuilder),
  update,
  insert,
}))

const sendLeadToServiceM8InboxMock = vi.hoisted(() => vi.fn())
const setJobLeadCardFieldsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({ db: dbMock }))
vi.mock('../client', () => ({
  createServiceM8ClientFromEnv: vi.fn(() => ({ sendLeadToInbox: sendLeadToServiceM8InboxMock })),
}))
vi.mock('@/lib/servicem8/client', () => ({
  setJobLeadCardFields: setJobLeadCardFieldsMock,
}))

import { syncLeadToServiceM8, retryServiceM8LeadSyncBatch } from '../sync'

const leadRow = {
  leadId: 'lead-1',
  servicem8JobUuid: null,
  clientName: 'Aroha Smith',
  companyName: null,
  phone: '021 123 456',
  email: 'aroha@example.com',
  channel: 'phone',
  source: 'existing_client_referral_repeat_builder_architect',
  projectType: 'pool_fence',
  location: 'Albany',
  suburb: 'Albany',
  budgetBand: '10k_to_50k',
  consentStatus: 'consent_under_review',
  priceSensitivityRead: 'average_negotiation',
  decisionMakers: 'sole_decision_maker',
  freeText: null,
  seedScore: 70,
  tier: 'B',
  scoreReason: 'Tier B (70): good fit',
  strikeFlag: null,
  completeness: 86,
  clientProfileKey: 'builder_developer_pool_builder_landscaper',
  complexity: 'new_build_commercial_fit_out',
  distanceBand: 'lt_15km',
  paymentHistory: 'new_client',
  siteAccess: 'easy',
  installationHeight: 'ground_floor_ladder',
  updatedAt: new Date('2026-07-06T00:00:00.000Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  selectBuilder.from.mockReturnValue(selectBuilder)
  selectBuilder.innerJoin.mockReturnValue(selectBuilder)
  selectBuilder.where.mockReturnValue(selectBuilder)
  selectBuilder.orderBy.mockReturnValue(selectBuilder)
  process.env.SERVICEM8_API_KEY = 'test-key'
  process.env.SERVICEM8_INBOX_EMAIL = 'de9f86@inbox.servicem8.com'
  process.env.SERVICEM8_LEAD_QUALITY_FIELD = ''
  selectLimit.mockResolvedValue([leadRow])
  updateWhere.mockResolvedValue([])
  insertValues.mockResolvedValue([])
  setJobLeadCardFieldsMock.mockReset()
  setJobLeadCardFieldsMock.mockResolvedValue({ updated: ['jobDescription', 'clientType', 'leadsQuality', 'note'], skipped: [] })
})

describe('syncLeadToServiceM8', () => {
  it('sends a ServiceM8 inbox email and marks the lead synced', async () => {
    selectLimit
      .mockResolvedValueOnce([leadRow])
      .mockResolvedValueOnce([])
    sendLeadToServiceM8InboxMock.mockResolvedValue({
      reference: 'inbox:lead-1',
      noteSignature: 'B|70|86|Tier B (70): good fit|',
    })

    const result = await syncLeadToServiceM8('lead-1')

    expect(result).toEqual({ ok: true, leadId: 'lead-1', reference: 'inbox:lead-1' })
    expect(sendLeadToServiceM8InboxMock).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 'lead-1', tier: 'B' }),
      { createNote: true },
    )
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      servicem8JobUuid: null,
      syncStatus: 'synced',
      syncError: null,
    }))
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      action: 'lead.servicem8_sync',
      targetId: 'lead-1',
    }))
  })

  it('skips the ServiceM8 inbox email and marks the lead synced when already linked', async () => {
    selectLimit
      .mockResolvedValueOnce([{ ...leadRow, servicem8JobUuid: 'job-uuid-1' }])

    const result = await syncLeadToServiceM8('lead-1')

    expect(result).toEqual({ ok: true, leadId: 'lead-1', reference: 'linked:job-uuid-1' })
    expect(sendLeadToServiceM8InboxMock).not.toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      servicem8JobUuid: 'job-uuid-1',
      syncStatus: 'synced',
      syncError: null,
    }))
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      action: 'lead.servicem8_sync',
      targetId: 'lead-1',
      detail: expect.objectContaining({
        reference: { to: 'linked:job-uuid-1' },
        skipped: { to: true },
        reason: { to: 'already_linked' },
      }),
    }))
  })

  it('writes the current lead fields to the linked ServiceM8 job card when the lead is already linked', async () => {
    selectLimit
      .mockResolvedValueOnce([{ ...leadRow, servicem8JobUuid: 'job-uuid-1' }])

    await syncLeadToServiceM8('lead-1')

    expect(setJobLeadCardFieldsMock).toHaveBeenCalledWith('job-uuid-1', {
      jobDescription: expect.stringContaining([
        '--- Contact ---',
        'Name: Aroha Smith',
        'Mobile: 021 123 456',
        'Email: aroha@example.com',
        'Address: Albany',
      ].join('\n')),
      clientType: 'Builder / Developer / Pool Builder / Landscaper',
      leadsQuality: 'B',
      note: 'Leads Quality B | Score 70 | 86% complete | Tier B (70): good fit | RGTools Lead lead-1',
    })
    expect(sendLeadToServiceM8InboxMock).not.toHaveBeenCalled()
  })

  it('writes the complete Job Description for a linked lead without inventing a missing score', async () => {
    selectLimit.mockResolvedValueOnce([{
      ...leadRow,
      servicem8JobUuid: 'job-uuid-unscored',
      tier: null,
      seedScore: null,
      completeness: null,
      scoreReason: null,
    }])

    await syncLeadToServiceM8('lead-1')

    expect(setJobLeadCardFieldsMock).toHaveBeenCalledWith(
      'job-uuid-unscored',
      expect.objectContaining({
        jobDescription: expect.stringContaining('--- Contact ---\nName: Aroha Smith'),
        leadsQuality: null,
      }),
    )
    const jobDescription = setJobLeadCardFieldsMock.mock.calls[0][1].jobDescription
    expect(jobDescription).not.toContain('Quality:')
    expect(jobDescription).not.toContain('Score:')
  })

  it('does not write job card fields when the lead is not linked to a job', async () => {
    selectLimit
      .mockResolvedValueOnce([leadRow])
      .mockResolvedValueOnce([])
    sendLeadToServiceM8InboxMock.mockResolvedValue({
      reference: 'inbox:lead-1',
      noteSignature: 'B|70|86|Tier B (70): good fit|',
    })

    await syncLeadToServiceM8('lead-1')

    expect(setJobLeadCardFieldsMock).not.toHaveBeenCalled()
  })

  it('still marks the linked lead synced when the ServiceM8 job card write fails', async () => {
    selectLimit
      .mockResolvedValueOnce([{ ...leadRow, servicem8JobUuid: 'job-uuid-1' }])
    setJobLeadCardFieldsMock.mockRejectedValue(new Error('ServiceM8 lead job card write failed with HTTP 403'))

    const result = await syncLeadToServiceM8('lead-1')

    expect(result).toEqual({ ok: true, leadId: 'lead-1', reference: 'linked:job-uuid-1' })
  })

  it('marks sync_failed and stores the error when ServiceM8 rejects the sync', async () => {
    selectLimit
      .mockResolvedValueOnce([leadRow])
      .mockResolvedValueOnce([])
    sendLeadToServiceM8InboxMock.mockRejectedValue(new Error('ServiceM8 inbox email failed'))

    const result = await syncLeadToServiceM8('lead-1')

    expect(result).toEqual({
      ok: false,
      leadId: 'lead-1',
      error: 'ServiceM8 inbox email failed',
    })
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      syncStatus: 'sync_failed',
      syncError: 'ServiceM8 inbox email failed',
    }))
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      action: 'lead.servicem8_sync_failed',
      targetId: 'lead-1',
    }))
  })
})

describe('retryServiceM8LeadSyncBatch', () => {
  it('retries only the loaded pending or failed leads up to the batch limit', async () => {
    selectLimit
      .mockResolvedValueOnce([{ leadId: 'lead-1' }, { leadId: 'lead-2' }])
      .mockResolvedValueOnce([leadRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...leadRow, leadId: 'lead-2' }])
      .mockResolvedValueOnce([])
    sendLeadToServiceM8InboxMock.mockResolvedValue({
      reference: 'inbox:lead-1',
      noteSignature: 'B|70|86|Tier B (70): good fit|',
    })

    const result = await retryServiceM8LeadSyncBatch({ limit: 2 })

    expect(result.total).toBe(2)
    expect(result.results).toHaveLength(2)
    expect(sendLeadToServiceM8InboxMock).toHaveBeenCalledTimes(2)
  })
})
