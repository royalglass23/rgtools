// Read-only: uses the configured database without creating or modifying records.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTrackedQuoteOverview } from '@/modules/quote-tracker/overview-queries'
import { parseQuoteListFilters } from '@/modules/quote-tracker/list-filters'
import { listQuotes } from '@/modules/quote-tracker/queries'
import { trackedQuoteListHref } from '@/modules/quote-tracker/quote-period'
import { QUOTE_PROGRESS_GROUPS, quoteProgressHref } from '@/modules/quote-tracker/quote-progress'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quoteProgressWhere, trackedPeriodWhere } from '@/modules/quote-tracker/quote-scope'

describe('quote dashboard and Track Quotes reconciliation (read only)', () => {
  afterEach(() => vi.useRealTimers())

  it('partitions boundary, missing engagement, expired, archived and resolved fixtures without writing records', async () => {
    const now = new Date('2026-10-23T12:00:00Z')
    const counts = QUOTE_PROGRESS_GROUPS.map(({ id }) => sql`count(*) filter (where ${quoteProgressWhere(id, now)})::int as ${sql.identifier(id)}`)
    const result = await db.execute(sql`
      with quotes(id, created_at, expires_at, archived_at, outcome) as (values
        (1, '2026-10-22T12:00:00Z'::timestamptz, null::timestamptz, null::timestamptz, null::text),
        (2, '2026-10-20T12:00:00Z'::timestamptz, null, null, null),
        (3, '2026-10-19T12:00:00Z'::timestamptz, null, null, null),
        (4, '2026-10-19T12:00:00Z'::timestamptz, null, null, null),
        (5, '2026-10-19T12:00:00Z'::timestamptz, null, null, null),
        (6, '2026-10-19T12:00:00Z'::timestamptz, '2026-10-22T12:00:00Z', null, 'won'),
        (7, '2026-10-19T12:00:00Z'::timestamptz, '2026-10-22T12:00:00Z', null, 'lost'),
        (8, '2026-10-19T12:00:00Z'::timestamptz, '2026-10-22T12:00:00Z', null, null),
        (9, '2026-10-19T12:00:00Z'::timestamptz, null, '2026-10-22T12:00:00Z', 'won'),
        (10, '2026-10-24T12:00:00Z'::timestamptz, null, null, null),
        (11, '2026-10-10T12:00:00Z'::timestamptz, null, null, null)
      ), quote_engagement(quote_id, total_opens) as (values (1,0), (2,0), (4,1), (5,2), (6,2))
      select ${sql.join(counts, sql`, `)} from quotes
      left join quote_engagement on quote_engagement.quote_id = quotes.id
      where ${trackedPeriodWhere('7', now)}
    `)
    expect(result.rows[0]).toEqual({ waiting: 1, overdue: 2, once: 1, repeat: 1, won: 1, lost: 1 })
  })

  it.each(['30', 'all'] as const)('reconciles %s cards against their destination filters', async (period) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const overview = await getTrackedQuoteOverview({ activity: { page: 1, size: 5 }, attention: { page: 1, size: 5 } }, period)
    const cases = [
      { filter: {}, count: overview.snapshot.activeLinks },
      { filter: { status: 'hot' }, count: overview.snapshot.hotCount },
      { filter: { activity: 'unopened_3_days' }, count: overview.snapshot.unopenedAfterThreeDays },
      { filter: { activity: 'viewed' }, count: overview.snapshot.viewedCount },
    ]
    for (const entry of cases) {
      const url = new URL(trackedQuoteListHref(period, entry.filter), 'https://test.local')
      const list = await listQuotes(parseQuoteListFilters(Object.fromEntries(url.searchParams)))
      expect(Number(list.total)).toBe(entry.count)
      if (Object.keys(entry.filter).length === 0) expect(Number(list.kpis.totalValue)).toBe(Number(overview.snapshot.totalValue))
    }
    for (const bucket of overview.progress) {
      const url = new URL(quoteProgressHref(period, bucket.id), 'https://test.local')
      const list = await listQuotes(parseQuoteListFilters(Object.fromEntries(url.searchParams)))
      expect(Number(list.total), bucket.id).toBe(bucket.count)
      expect(Number(list.kpis.totalValue), bucket.id).toBe(Number(bucket.totalValue))
    }
  }, 60_000)
})
