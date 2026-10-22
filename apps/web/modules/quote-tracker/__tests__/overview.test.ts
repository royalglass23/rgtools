import { describe, expect, it } from 'vitest'
import { buildAttentionRows, buildEngagementPreview, pageBounds, parseOverviewPaging, type AttentionCandidate } from '../overview'

const now = new Date('2026-10-22T03:00:00Z')

function candidate(overrides: Partial<AttentionCandidate> = {}): AttentionCandidate {
  return {
    id: 'quote-1',
    clientName: 'Ada',
    workOrderId: 'Q100',
    jobAddress: '12 Glass Street',
    statusTag: 'cold',
    totalOpens: 0,
    forwardingSuspected: false,
    lastOpenedAt: null,
    expiresAt: new Date('2026-11-22T03:00:00Z'),
    ...overrides,
  }
}

describe('overview paging', () => {
  it('defaults both lists to five and accepts only offered sizes and positive pages', () => {
    expect(parseOverviewPaging({})).toEqual({
      activity: { page: 1, size: 5 },
      attention: { page: 1, size: 5 },
    })
    expect(parseOverviewPaging({ activityPage: '2', activitySize: '10', attentionPage: '3', attentionSize: '50' })).toEqual({
      activity: { page: 2, size: 10 },
      attention: { page: 3, size: 50 },
    })
    expect(parseOverviewPaging({ activityPage: '-4', activitySize: '100', attentionPage: '2.5', attentionSize: '0' })).toEqual({
      activity: { page: 1, size: 5 },
      attention: { page: 1, size: 5 },
    })
  })

  it('clamps a stale page to the last available page', () => {
    expect(pageBounds(12, { page: 99, size: 5 })).toEqual({ total: 12, page: 3, size: 5, pageCount: 3, offset: 10 })
    expect(pageBounds(0, { page: 4, size: 5 })).toEqual({ total: 0, page: 1, size: 5, pageCount: 1, offset: 0 })
  })
})

describe('buildAttentionRows', () => {
  it('explains every applicable attention signal without overstating observed interest', () => {
    const quote = candidate({
      statusTag: 'hot',
      totalOpens: 3,
      forwardingSuspected: true,
      lastOpenedAt: new Date('2026-10-21T03:00:00Z'),
      expiresAt: new Date('2026-10-25T03:00:00Z'),
    })

    expect(buildAttentionRows([quote], now)).toEqual([{
      ...quote,
      reasons: ['Hot status (may be manual)', 'Opened more than once', 'Possible forwarding', 'Link expires soon'],
    }])
    expect(buildAttentionRows([candidate({ statusTag: 'hot' })], now)[0]?.reasons).toEqual([
      'No opens yet',
      'Hot status (may be manual)',
    ])
  })

  it('does not truncate a database page of 20 quotes', () => {
    const rows = Array.from({ length: 20 }, (_, index) => candidate({ id: `quote-${index}` }))
    expect(buildAttentionRows(rows, now)).toHaveLength(20)
  })
})

describe('buildEngagementPreview', () => {
  const events = { totalOpens: 3, uniqueSessions: 2, totalTimeMs: 250_000, maxScrollDepth: 100, uniqueDevices: 2, hasCta: true }

  it('uses stored engagement and the quote detail scoring formula', () => {
    expect(buildEngagementPreview({ ...events, forwardingSuspected: true }, events)).toEqual({
      totalOpens: 3,
      uniqueSessions: 2,
      totalTimeMs: 250_000,
      maxScrollDepth: 100,
      forwardingSuspected: true,
      interestScore: 100,
    })
  })

  it('uses event totals when an engagement summary has not been saved', () => {
    expect(buildEngagementPreview(null, { ...events, hasCta: false })).toEqual({
      totalOpens: 3,
      uniqueSessions: 2,
      totalTimeMs: 250_000,
      maxScrollDepth: 100,
      forwardingSuspected: false,
      interestScore: 70,
    })
    expect(buildEngagementPreview(null, undefined).interestScore).toBe(0)
  })
})
