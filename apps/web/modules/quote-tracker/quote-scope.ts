import { currentQuoteStats } from './current-stats'
import { and, eq, gt, gte, isNull, lte, or, sql } from 'drizzle-orm'
import { quotes, quoteEvents } from '@rgtools/db/schema'
import { DAY_MS, trackedSince, type TrackedPeriod } from './quote-period'
import type { QuoteProgressGroup } from './quote-progress'

export function trackedPeriodWhere(period: TrackedPeriod, now: Date) {
  const since = trackedSince(period, now)
  return and(lte(quotes.createdAt, now), since ? gte(quotes.createdAt, since) : undefined)!
}

export function activeQuoteWhere(now: Date) {
  return and(isNull(quotes.archivedAt), or(isNull(quotes.expiresAt), gt(quotes.expiresAt, now)))!
}

export function unopenedAfterThreeDaysWhere(now: Date) {
  const opens = currentQuoteStats(now).totalOpens
  return and(
    lte(quotes.createdAt, new Date(now.getTime() - 3 * DAY_MS)),
    or(isNull(opens), eq(opens, 0)),
  )!
}

// Shared by overview aggregates and their Track Quotes destinations.
export function quoteProgressWhere(group: QuoteProgressGroup, now: Date) {
  const opens = currentQuoteStats(now).totalOpens
  if (group === 'won' || group === 'lost') return and(isNull(quotes.archivedAt), eq(quotes.outcome, group))!
  const unopened = or(isNull(opens), eq(opens, 0))
  const activity = group === 'waiting'
    ? and(unopened, gt(quotes.createdAt, new Date(now.getTime() - 3 * DAY_MS)))
    : group === 'overdue' ? unopenedAfterThreeDaysWhere(now)
    : group === 'once' ? eq(opens, 1)
    : gte(opens, 2)
  return and(activeQuoteWhere(now), isNull(quotes.outcome), activity)!
}

export function viewedInPeriodWhere(period: TrackedPeriod, now: Date) {
  const since = trackedSince(period, now)
  return sql`exists (select 1 from ${quoteEvents} where ${quoteEvents.quoteId} = ${quotes.id}
    and ${quoteEvents.eventType} = 'open' and ${quoteEvents.createdAt} <= ${now}
    ${since ? sql`and ${quoteEvents.createdAt} >= ${since}` : sql``})`
}
