// Read-only: uses the configured database without creating or modifying records.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTrackedQuoteOverview } from '@/modules/quote-tracker/overview-queries'
import { parseQuoteListFilters } from '@/modules/quote-tracker/list-filters'
import { listQuotes } from '@/modules/quote-tracker/queries'
import { trackedQuoteListHref } from '@/modules/quote-tracker/quote-period'

describe('quote dashboard and Track Quotes reconciliation (read only)', () => {
  afterEach(() => vi.useRealTimers())

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
  }, 60_000)
})
