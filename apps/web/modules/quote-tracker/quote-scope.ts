import { and, eq, gt, gte, isNull, lte, or, sql } from 'drizzle-orm'
import { quotes, quoteEngagement, quoteEvents } from '@rgtools/db/schema'
import { DAY_MS, trackedSince, type TrackedPeriod } from './quote-period'

export function trackedPeriodWhere(period: TrackedPeriod, now: Date) {
  const since = trackedSince(period, now)
  return and(lte(quotes.createdAt, now), since ? gte(quotes.createdAt, since) : undefined)!
}

export function activeQuoteWhere(now: Date) {
  return and(isNull(quotes.archivedAt), or(isNull(quotes.expiresAt), gt(quotes.expiresAt, now)))!
}

export function unopenedAfterThreeDaysWhere(now: Date) {
  return and(
    lte(quotes.createdAt, new Date(now.getTime() - 3 * DAY_MS)),
    or(isNull(quoteEngagement.totalOpens), eq(quoteEngagement.totalOpens, 0)),
  )!
}

export function viewedInPeriodWhere(period: TrackedPeriod, now: Date) {
  const since = trackedSince(period, now)
  return sql`exists (select 1 from ${quoteEvents} where ${quoteEvents.quoteId} = ${quotes.id}
    and ${quoteEvents.eventType} = 'open' and ${quoteEvents.createdAt} <= ${now}
    ${since ? sql`and ${quoteEvents.createdAt} >= ${since}` : sql``})`
}
