// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const whereCalls = vi.hoisted(() => [] as unknown[])

const leadsRows = vi.hoisted(() => [] as Array<{ createdAt: Date }>)
const quotesRows = vi.hoisted(() => [] as Array<{ statusTag: string | null; createdAt: Date }>)

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  count: vi.fn(() => 'count'),
  eq: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'eq', column: column.name, value })),
  gt: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'gt', column: column.name, value })),
  gte: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'gte', column: column.name, value })),
  isNull: vi.fn((column: { name?: string }) => ({ type: 'isNull', column: column.name })),
  lt: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'lt', column: column.name, value })),
  lte: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'lte', column: column.name, value })),
  ne: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'ne', column: column.name, value })),
  or: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
  sql: vi.fn(() => ({ type: 'sql', mapWith() { return this } })),
  sum: vi.fn((column: { name?: string }) => ({ type: 'sum', column: column.name })),
}))

vi.mock('@rgtools/db/schema-leads', () => ({
  leads: {
    archivedAt: { name: 'archived_at' },
    servicem8JobUuid: { name: 'servicem8_job_uuid' },
    syncStatus: { name: 'sync_status' },
    createdAt: { name: 'created_at' },
    tier: { name: 'tier' },
    seedScore: { name: 'seed_score' },
  },
}))

vi.mock('@rgtools/db/schema', () => ({
  quotes: {
    id: { name: 'id' },
    statusTag: { name: 'status_tag' },
    expiresAt: { name: 'expires_at' },
    archivedAt: { name: 'archived_at' },
    quoteValue: { name: 'quote_value' },
    createdAt: { name: 'created_at' },
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
    select: vi.fn((shape: Record<string, unknown>) => {
      const resultData = 'statusTag' in shape ? quotesRows : leadsRows
      return {
        from: vi.fn(() => ({
          where: vi.fn((condition: unknown) => {
            whereCalls.push(condition)
            return Promise.resolve(resultData)
          }),
        })),
      }
    }),
  },
}))

vi.mock('@/modules/leads/queries', () => ({ STALE_LEAD_DAYS: 7 }))
vi.mock('@/modules/quote-tracker/queries', () => ({ EXPIRING_SOON_DAYS: 7, GONE_COLD_DAYS: 14 }))

import { getDashboardChartData } from '../kpis'

beforeEach(() => {
  vi.clearAllMocks()
  whereCalls.length = 0
  leadsRows.length = 0
  quotesRows.length = 0
})

describe('getDashboardChartData – leadsPerWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 8 entries and counts leads in current ISO week', async () => {
    const d = new Date('2026-06-27T00:00:00Z')
    leadsRows.push({ createdAt: d }, { createdAt: d }, { createdAt: d })

    const result = await getDashboardChartData()

    expect(result.leadsPerWeek).toHaveLength(8)
    const currentWeek = result.leadsPerWeek.find((w) => w.week === '2026-W26')
    expect(currentWeek?.count).toBe(3)
  })

  it('empty weeks have count 0', async () => {
    const result = await getDashboardChartData()

    expect(result.leadsPerWeek.every((w) => w.count === 0)).toBe(true)
    expect(result.leadsPerWeek).toHaveLength(8)
  })
})

describe('getDashboardChartData – pipelineByWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 8 entries and buckets quotes by status for current ISO week', async () => {
    const d = new Date('2026-06-27T00:00:00Z')
    quotesRows.push(
      { statusTag: 'hot', createdAt: d },
      { statusTag: 'hot', createdAt: d },
      { statusTag: 'warm', createdAt: d },
      { statusTag: 'cold', createdAt: d },
      { statusTag: null, createdAt: d },  // unknown status — not counted
    )

    const result = await getDashboardChartData()

    expect(result.pipelineByWeek).toHaveLength(8)
    const currentWeek = result.pipelineByWeek.find((w) => w.week === '2026-W26')
    expect(currentWeek).toEqual({ week: '2026-W26', hot: 2, warm: 1, cold: 1, dead: 0 })
  })
})

describe('getDashboardChartData – quotes WHERE', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes gte on created_at with 56-day back cutoff', async () => {
    await getDashboardChartData()

    const cutoff = new Date('2026-05-02T00:00:00Z')
    expect(whereCalls[1]).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          { type: 'gte', column: 'created_at', value: cutoff },
        ]),
      }),
    )
  })
})

describe('getDashboardChartData – leads WHERE', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes gte on created_at with 56-day back cutoff', async () => {
    await getDashboardChartData()

    const cutoff = new Date('2026-05-02T00:00:00Z')
    expect(whereCalls[0]).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          { type: 'gte', column: 'created_at', value: cutoff },
        ]),
      }),
    )
  })
})
