// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const whereCalls = vi.hoisted(() => [] as unknown[])

const leadsCurrentRows = vi.hoisted(
  () => [] as Array<{ servicem8JobUuid: string | null; seedScore: number | null; createdAt: Date }>,
)
const leadsPriorRows = vi.hoisted(() => [] as Array<{ createdAt: Date }>)
const pipelineSumRow = vi.hoisted(
  () => [{ pipelineValue: '0' }] as Array<{ pipelineValue: string | null }>,
)
const outcomeRow = vi.hoisted(
  () => [{ won: 0, total: 0 }] as Array<{ won: number; total: number }>,
)

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  count: vi.fn(() => 'count'),
  eq: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'eq', column: column.name, value })),
  gt: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'gt', column: column.name, value })),
  gte: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'gte', column: column.name, value })),
  isNull: vi.fn((column: { name?: string }) => ({ type: 'isNull', column: column.name })),
  isNotNull: vi.fn((column: { name?: string }) => ({ type: 'isNotNull', column: column.name })),
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
    outcome: { name: 'outcome' },
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
      let resultData: unknown[]
      if ('pipelineValue' in shape) {
        resultData = pipelineSumRow
      } else if ('won' in shape) {
        resultData = outcomeRow
      } else if ('servicem8JobUuid' in shape) {
        resultData = leadsCurrentRows
      } else if ('quoteValue' in shape) {
        resultData = []
      } else {
        resultData = leadsPriorRows
      }
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

import { getDashboardKpis } from '../kpis'

beforeEach(() => {
  vi.clearAllMocks()
  whereCalls.length = 0
  leadsCurrentRows.length = 0
  leadsPriorRows.length = 0
  pipelineSumRow.length = 0
  pipelineSumRow.push({ pipelineValue: '0' })
  outcomeRow.length = 0
  outcomeRow.push({ won: 0, total: 0 })
})

describe('getDashboardKpis – pipelineValue', () => {
  it('parses DB sum string to number', async () => {
    pipelineSumRow.length = 0
    pipelineSumRow.push({ pipelineValue: '15000.00' })

    const result = await getDashboardKpis()

    expect(result.pipelineValue).toBe(15000)
  })

  it('returns 0 when sum is null', async () => {
    pipelineSumRow.length = 0
    pipelineSumRow.push({ pipelineValue: null })

    const result = await getDashboardKpis()

    expect(result.pipelineValue).toBe(0)
  })
})

describe('getDashboardKpis – volumeTrend', () => {
  it('returns 100 when current period is double prior period', async () => {
    for (let i = 0; i < 10; i++) leadsCurrentRows.push({ servicem8JobUuid: null, seedScore: null, createdAt: new Date() })
    for (let i = 0; i < 5; i++) leadsPriorRows.push({ createdAt: new Date() })

    const result = await getDashboardKpis()

    expect(result.volumeTrend).toBe(100)
  })

  it('returns 0 when prior period has no leads', async () => {
    for (let i = 0; i < 5; i++) leadsCurrentRows.push({ servicem8JobUuid: null, seedScore: null, createdAt: new Date() })
    // leadsPriorRows stays empty

    const result = await getDashboardKpis()

    expect(result.volumeTrend).toBe(0)
  })
})

describe('getDashboardKpis – conversionRate', () => {
  it('returns 70 when 7 of 10 closed quotes were won', async () => {
    outcomeRow.length = 0
    outcomeRow.push({ won: 7, total: 10 })

    const result = await getDashboardKpis()

    expect(result.conversionRate).toBe(70)
  })

  it('returns 0 when no closed quotes exist', async () => {
    // outcomeRow default is { won: 0, total: 0 }
    const result = await getDashboardKpis()

    expect(result.conversionRate).toBe(0)
  })
})

describe('getDashboardKpis – pipeline WHERE', () => {
  it('includes hot/warm or condition, not-archived, and not-expired', async () => {
    await getDashboardKpis()

    expect(whereCalls[0]).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({
            type: 'or',
            conditions: expect.arrayContaining([
              { type: 'eq', column: undefined, value: 'hot' },
              { type: 'eq', column: undefined, value: 'warm' },
            ]),
          }),
          { type: 'isNull', column: 'archived_at' },
          expect.objectContaining({ type: 'gt', column: 'expires_at' }),
        ]),
      }),
    )
  })
})

describe('getDashboardKpis – leads prior 30d WHERE', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes gte with 60-day lower bound and lt with 30-day upper bound', async () => {
    await getDashboardKpis()

    const cutoff30 = new Date('2026-05-28T00:00:00Z')
    const cutoff60 = new Date('2026-04-28T00:00:00Z')
    expect(whereCalls[3]).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          { type: 'gte', column: 'created_at', value: cutoff60 },
          { type: 'lt', column: 'created_at', value: cutoff30 },
        ]),
      }),
    )
  })
})

describe('getDashboardKpis – leads current 30d WHERE', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes gte on created_at with 30-day back cutoff', async () => {
    await getDashboardKpis()

    const cutoff = new Date('2026-05-28T00:00:00Z')
    expect(whereCalls[2]).toEqual(
      expect.objectContaining({
        type: 'and',
        conditions: expect.arrayContaining([
          { type: 'gte', column: 'created_at', value: cutoff },
        ]),
      }),
    )
  })
})
