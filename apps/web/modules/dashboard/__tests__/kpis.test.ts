// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const whereCalls = vi.hoisted(() => [] as unknown[])

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  count: vi.fn(() => 'count'),
  eq: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'eq', column: column.name, value })),
  gt: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'gt', column: column.name, value })),
  isNotNull: vi.fn((column: { name?: string }) => ({ type: 'isNotNull', column: column.name })),
  isNull: vi.fn((column: { name?: string }) => ({ type: 'isNull', column: column.name })),
  lte: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'lte', column: column.name, value })),
  ne: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'ne', column: column.name, value })),
  or: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
  sql: vi.fn(() => ({ type: 'sql' })),
}))

vi.mock('@rgtools/db/schema-leads', () => ({
  leads: {
    archivedAt: { name: 'archived_at' },
    servicem8JobUuid: { name: 'servicem8_job_uuid' },
    syncStatus: { name: 'sync_status' },
    createdAt: { name: 'created_at' },
    tier: { name: 'tier' },
  },
}))

vi.mock('@rgtools/db/schema', () => ({
  quotes: {
    id: { name: 'id' },
    statusTag: { name: 'status_tag' },
    expiresAt: { name: 'expires_at' },
    archivedAt: { name: 'archived_at' },
  },
  quoteEngagement: {
    quoteId: { name: 'quote_id' },
    totalOpens: { name: 'total_opens' },
    lastOpenedAt: { name: 'last_opened_at' },
    forwardingSuspected: { name: 'forwarding_suspected' },
  },
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((condition: unknown) => {
          whereCalls.push(condition)
          return Promise.resolve([{ total: 0 }])
        }),
        leftJoin: vi.fn(() => ({
          where: vi.fn((condition: unknown) => {
            whereCalls.push(condition)
            return Promise.resolve([{ total: 0 }])
          }),
        })),
      })),
    })),
  },
}))

vi.mock('@/modules/leads/queries', () => ({ STALE_LEAD_DAYS: 7 }))
vi.mock('@/modules/quote-tracker/queries', () => ({ EXPIRING_SOON_DAYS: 7, GONE_COLD_DAYS: 14 }))

import { getDashboardActionCounts } from '../kpis'

beforeEach(() => {
  vi.clearAllMocks()
  whereCalls.length = 0
})

describe('getDashboardActionCounts – unsynced', () => {
  it('includes every non-failed lead without a ServiceM8 job', async () => {
    await getDashboardActionCounts()

    expect(whereCalls[1]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        { type: 'isNull', column: 'servicem8_job_uuid' },
        { type: 'ne', column: 'sync_status', value: 'sync_failed' },
      ]),
    }))
  })
})

describe('getDashboardActionCounts – expiringSoon', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes lte on expires_at with 7-day forward cutoff', async () => {
    await getDashboardActionCounts()

    const cutoff = new Date('2026-07-04T00:00:00Z')
    expect(whereCalls[2]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        { type: 'lte', column: 'expires_at', value: cutoff },
      ]),
    }))
  })
})

describe('getDashboardActionCounts – neverOpened', () => {
  it('includes or with isNull on total_opens', async () => {
    await getDashboardActionCounts()

    expect(whereCalls[3]).toEqual(expect.objectContaining({
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

describe('getDashboardActionCounts – forwarding', () => {
  it('includes eq on forwarding_suspected and excludes archived/expired quotes', async () => {
    await getDashboardActionCounts()

    expect(whereCalls[4]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        { type: 'eq', column: 'forwarding_suspected', value: true },
        { type: 'isNull', column: 'archived_at' },
        expect.objectContaining({ type: 'gt', column: 'expires_at' }),
      ]),
    }))
  })
})

describe('getDashboardActionCounts – goneCold', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes only active hot or warm quotes with no engagement for 14 days', async () => {
    await getDashboardActionCounts()

    const cutoff = new Date('2026-06-13T00:00:00Z')
    expect(whereCalls[5]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        { type: 'isNull', column: 'archived_at' },
        expect.objectContaining({
          type: 'or',
          conditions: expect.arrayContaining([
            { type: 'isNull', column: 'expires_at' },
            expect.objectContaining({ type: 'gt', column: 'expires_at' }),
          ]),
        }),
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

describe('getDashboardActionCounts – staleLeads', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requires a linked ServiceM8 job and includes the 7-day back cutoff', async () => {
    await getDashboardActionCounts()

    const cutoff = new Date('2026-06-20T00:00:00Z')
    expect(whereCalls[0]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        { type: 'isNotNull', column: 'servicem8_job_uuid' },
        { type: 'lte', column: 'created_at', value: cutoff },
      ]),
    }))
  })
})
