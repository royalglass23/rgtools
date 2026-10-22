import { and, count, countDistinct, desc, eq, gt, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quoteEngagement, quoteEvents, quotes } from '@rgtools/db/schema'
import { buildAttentionRows } from './overview'

const FEED_LIMIT = 20
const CANDIDATE_LIMIT = 6
const DAY_MS = 24 * 60 * 60 * 1000

function activeLinks(now: Date) {
  return and(isNull(quotes.archivedAt), or(isNull(quotes.expiresAt), gt(quotes.expiresAt, now)))!
}

function attentionCandidates(predicate: SQL, order: SQL) {
  return db.select({
    id: quotes.id,
    clientName: quotes.clientName,
    workOrderId: quotes.workOrderId,
    statusTag: quotes.statusTag,
    totalOpens: quoteEngagement.totalOpens,
    forwardingSuspected: quoteEngagement.forwardingSuspected,
    lastOpenedAt: quoteEngagement.lastOpenedAt,
    expiresAt: quotes.expiresAt,
  })
    .from(quotes)
    .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
    .where(predicate)
    .orderBy(order, desc(quotes.createdAt))
    .limit(CANDIDATE_LIMIT)
}

export async function getTrackedQuoteOverview(now = new Date()) {
  const active = activeLinks(now)
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS)
  const expiryCutoff = new Date(now.getTime() + 7 * DAY_MS)

  const [snapshotRows, viewedRows, activity, highInterest, forwarding, expiring, neverOpened] = await Promise.all([
    db.select({
      activeLinks: count(),
      neverOpened: sql<number>`count(*) filter (where coalesce(${quoteEngagement.totalOpens}, 0) = 0)`,
    })
      .from(quotes)
      .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
      .where(active),
    db.select({ viewedQuotes: countDistinct(quoteEvents.quoteId) })
      .from(quoteEvents)
      .innerJoin(quotes, eq(quotes.id, quoteEvents.quoteId))
      .where(and(active, eq(quoteEvents.eventType, 'open'), gte(quoteEvents.createdAt, sevenDaysAgo), lte(quoteEvents.createdAt, now))),
    db.select({
      id: quoteEvents.id,
      quoteId: quotes.id,
      clientName: quotes.clientName,
      workOrderId: quotes.workOrderId,
      jobAddress: quotes.jobAddress,
      eventType: quoteEvents.eventType,
      createdAt: quoteEvents.createdAt,
    })
      .from(quoteEvents)
      .innerJoin(quotes, eq(quotes.id, quoteEvents.quoteId))
      .where(and(inArray(quoteEvents.eventType, ['open', 'download', 'cta']), lte(quoteEvents.createdAt, now)))
      .orderBy(desc(quoteEvents.createdAt), desc(quoteEvents.id))
      .limit(FEED_LIMIT),
    attentionCandidates(and(active, or(eq(quotes.statusTag, 'hot'), gte(quoteEngagement.totalOpens, 2)))!, sql`${quoteEngagement.lastOpenedAt} desc nulls last`),
    attentionCandidates(and(active, eq(quoteEngagement.forwardingSuspected, true))!, sql`${quoteEngagement.lastOpenedAt} desc nulls last`),
    attentionCandidates(and(active, gt(quotes.expiresAt, now), lte(quotes.expiresAt, expiryCutoff))!, sql`${quotes.expiresAt} asc`),
    attentionCandidates(and(active, or(isNull(quoteEngagement.totalOpens), eq(quoteEngagement.totalOpens, 0)))!, sql`${quotes.createdAt} desc`),
  ])

  return {
    asOf: now,
    snapshot: {
      activeLinks: Number(snapshotRows[0]?.activeLinks ?? 0),
      viewedLastSevenDays: Number(viewedRows[0]?.viewedQuotes ?? 0),
      neverOpened: Number(snapshotRows[0]?.neverOpened ?? 0),
    },
    activity,
    attention: buildAttentionRows([highInterest, forwarding, expiring, neverOpened], now),
  }
}
