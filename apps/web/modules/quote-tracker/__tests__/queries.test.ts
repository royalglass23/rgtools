// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const whereCalls = vi.hoisted(() => [] as unknown[])

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  asc: vi.fn((column: { name?: string }) => ({ direction: 'asc', column: column.name })),
  count: vi.fn(() => 'count'),
  desc: vi.fn((column: { name?: string }) => ({ direction: 'desc', column: column.name })),
  eq: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'eq', column: column.name, value })),
  gt: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'gt', column: column.name, value })),
  gte: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'gte', column: column.name, value })),
  ilike: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'ilike', column: column.name, value })),
  isNotNull: vi.fn((column: { name?: string }) => ({ type: 'isNotNull', column: column.name })),
  isNull: vi.fn((column: { name?: string }) => ({ type: 'isNull', column: column.name })),
  lte: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'lte', column: column.name, value })),
  or: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
  sql: vi.fn(() => ({ type: 'sql' })),
  sum: vi.fn(() => 'sum'),
}))

vi.mock('@rgtools/db/schema', () => ({
  quotes: {
    id: { name: 'id' },
    outcome: { name: 'outcome' },
    shortCode: { name: 'short_code' },
    clientName: { name: 'client_name' },
    companyName: { name: 'company_name' },
    jobDescription: { name: 'job_description' },
    jobAddress: { name: 'job_address' },
    quoteValue: { name: 'quote_value' },
    statusTag: { name: 'status_tag' },
    aiScore: { name: 'ai_score' },
    expiresAt: { name: 'expires_at' },
    archivedAt: { name: 'archived_at' },
    createdAt: { name: 'created_at' },
  },
  quoteEngagement: {
    quoteId: { name: 'quote_id' },
    totalOpens: { name: 'total_opens' },
    lastOpenedAt: { name: 'last_opened_at' },
    forwardingSuspected: { name: 'forwarding_suspected' },
  },
  quoteEvents: {},
  quoteNotifiedViewers: {},
  quoteRecipients: {},
  quoteViewerEmails: {},
  tagOverrides: {},
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn((shape: Record<string, unknown>) => {
      if ('total' in shape) {
        const totalWhere = vi.fn(async () => [{ total: 0 }])
        return {
          from: vi.fn(() => ({
            leftJoin: vi.fn(() => ({ where: totalWhere })),
            where: totalWhere,
          })),
        }
      }
      if ('coldCount' in shape) {
        return {
          from: vi.fn(() => ({
            leftJoin: vi.fn(() => ({
              where: vi.fn(async () => [{
                coldCount: 0, hotCount: 0, warmCount: 0,
                deadCount: 0, forwardingCount: 0,
                totalValue: '0', averageScore: 0,
              }]),
            })),
          })),
        }
      }
      return {
        from: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn((condition: unknown) => {
              whereCalls.push(condition)
              return {
                orderBy: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    offset: vi.fn(async () => []),
                  })),
                })),
              }
            }),
          })),
        })),
      }
    }),
  },
}))

vi.mock('../email-gate', () => ({
  validateEmailGateSettings: vi.fn(),
}))

vi.mock('../viewer-analytics', () => ({
  rollupDeviceSessions: vi.fn(),
  rollupGatedEmails: vi.fn(),
}))

import { listQuotes } from '../queries'
import type { QuoteListFilters } from '../list-filters'

const filters: QuoteListFilters = {
  trackedIn: 'all', outcome: 'all',
  search: '',
  status: 'all',
  linkStatus: 'all',
  sort: 'last_opened',
  page: 1,
  size: 5,
  activity: 'all',
}

beforeEach(() => {
  vi.clearAllMocks()
  whereCalls.length = 0
})

describe('dashboard scope in Track Quotes', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps the three-day boundary exclusive for recently unopened quotes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
    await listQuotes({ ...filters, activity: 'unopened_under_3_days' })
    expect(JSON.stringify(whereCalls[0])).toContain('2026-10-20T12:00:00.000Z')
    const scope = (whereCalls[0] as { conditions: unknown[] }).conditions[1]
    expect(scope).toEqual(expect.objectContaining({ type: 'and', conditions: expect.arrayContaining([
      { type: 'isNull', column: 'outcome' },
      expect.objectContaining({ type: 'and', conditions: expect.arrayContaining([
        { type: 'gt', column: 'created_at', value: new Date('2026-10-20T12:00:00Z') },
      ]) }),
    ]) }))
  })

  it.each([['opened_once', 'eq', 1], ['opened_multiple', 'gte', 2]] as const)('uses the matching open count for %s', async (activity, type, value) => {
    await listQuotes({ ...filters, activity })
    const scope = (whereCalls[0] as { conditions: unknown[] }).conditions[1]
    expect(scope).toEqual(expect.objectContaining({ type: 'and', conditions: expect.arrayContaining([
      { type: 'isNull', column: 'outcome' },
      { type, column: 'total_opens', value },
    ]) }))
  })

  it.each(['won', 'lost'] as const)('shows nonarchived %s outcomes even with expired links', async (outcome) => {
    await listQuotes({ ...filters, outcome, linkStatus: 'all' })
    expect(whereCalls[0]).toEqual(expect.objectContaining({ type: 'and', conditions: expect.arrayContaining([
      { type: 'eq', column: 'outcome', value: outcome },
      { type: 'isNull', column: 'archived_at' },
    ]) }))
    expect(JSON.stringify(whereCalls[0])).not.toContain('expires_at')
  })

  it('combines the rolling creation period, unresolved outcome and unopened age boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
    await listQuotes({ ...filters, trackedIn: '14', outcome: 'open', linkStatus: 'active', activity: 'unopened_3_days' })
    expect(whereCalls[0]).toEqual(expect.objectContaining({
      type: 'and', conditions: expect.arrayContaining([
        { type: 'isNull', column: 'outcome' },
        expect.objectContaining({ type: 'and', conditions: expect.arrayContaining([
          { type: 'gte', column: 'created_at', value: new Date('2026-10-09T12:00:00Z') },
          { type: 'lte', column: 'created_at', value: new Date('2026-10-23T12:00:00Z') },
        ]) }),
        expect.objectContaining({ type: 'and', conditions: expect.arrayContaining([
          { type: 'lte', column: 'created_at', value: new Date('2026-10-20T12:00:00Z') },
        ]) }),
      ]),
    }))
  })
})

describe('listQuotes – activity=expiring WHERE clause', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes lte on expires_at with 7-day forward cutoff when activity is expiring', async () => {
    await listQuotes({ ...filters, activity: 'expiring' })

    const cutoff = new Date('2026-07-04T00:00:00Z')
    expect(whereCalls[0]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        { type: 'lte', column: 'expires_at', value: cutoff },
      ]),
    }))
  })
})

describe('listQuotes – activity=never_opened WHERE clause', () => {
  it('includes or with isNull on total_opens when activity is never_opened', async () => {
    await listQuotes({ ...filters, activity: 'never_opened' })

    expect(whereCalls[0]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        expect.objectContaining({
          type: 'or',
          conditions: expect.arrayContaining([
            { type: 'isNull', column: 'total_opens' },
          ]),
        }),
      ]),
    }))
  })
})

describe('listQuotes – activity=forwarding WHERE clause', () => {
  it('includes eq on forwarding_suspected when activity is forwarding', async () => {
    await listQuotes({ ...filters, activity: 'forwarding' })

    expect(whereCalls[0]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        { type: 'eq', column: 'forwarding_suspected', value: true },
      ]),
    }))
  })
})

describe('listQuotes – activity=gone_cold WHERE clause', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes or with lte on last_opened_at with 14-day back cutoff when activity is gone_cold', async () => {
    await listQuotes({ ...filters, activity: 'gone_cold' })

    const cutoff = new Date('2026-06-13T00:00:00Z')
    expect(whereCalls[0]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        expect.objectContaining({
          type: 'or',
          conditions: expect.arrayContaining([
            { type: 'lte', column: 'last_opened_at', value: cutoff },
          ]),
        }),
      ]),
    }))
  })
})
