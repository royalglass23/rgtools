import { and, count, countDistinct, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quoteEngagement, quoteEvents, quotes } from '@rgtools/db/schema'
import { buildAttentionRows, pageBounds, type OverviewPaging } from './overview'

const DAY_MS = 24 * 60 * 60 * 1000

function activeLinks(now: Date) {
  return and(isNull(quotes.archivedAt), or(isNull(quotes.expiresAt), gt(quotes.expiresAt, now)))!
}

export async function getTrackedQuoteOverview(paging: OverviewPaging, now = new Date()) {
  const active = activeLinks(now)
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS)
  const expiryCutoff = new Date(now.getTime() + 7 * DAY_MS)
  const activityWhere = and(inArray(quoteEvents.eventType, ['open', 'download', 'cta']), lte(quoteEvents.createdAt, now))!
  const attentionWhere = and(active, or(
    eq(quotes.statusTag, 'hot'),
    gte(quoteEngagement.totalOpens, 2),
    eq(quoteEngagement.forwardingSuspected, true),
    and(gt(quotes.expiresAt, now), lte(quotes.expiresAt, expiryCutoff)),
    isNull(quoteEngagement.totalOpens),
    eq(quoteEngagement.totalOpens, 0),
  ))!

  const [snapshotRows, viewedRows, activityCountRows, attentionCountRows] = await Promise.all([
    db.select({
      activeLinks: count(),
      neverOpened: sql<number>`count(*) filter (where coalesce(${quoteEngagement.totalOpens}, 0) = 0)`,
    })
      .from(quotes)
      .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
      .where(active),
    db.select({
      viewedLastSevenDays: sql<number>`count(distinct ${quoteEvents.quoteId}) filter (where ${quoteEvents.createdAt} >= ${sevenDaysAgo})`,
      viewedLastThirtyDays: countDistinct(quoteEvents.quoteId),
    })
      .from(quoteEvents)
      .innerJoin(quotes, eq(quotes.id, quoteEvents.quoteId))
      .where(and(active, eq(quoteEvents.eventType, 'open'), gte(quoteEvents.createdAt, thirtyDaysAgo), lte(quoteEvents.createdAt, now))),
    db.select({ total: count() })
      .from(quoteEvents)
      .innerJoin(quotes, eq(quotes.id, quoteEvents.quoteId))
      .where(activityWhere),
    db.select({ total: countDistinct(quotes.id) })
      .from(quotes)
      .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
      .where(attentionWhere),
  ])

  const activityPage = pageBounds(Number(activityCountRows[0]?.total ?? 0), paging.activity)
  const attentionPage = pageBounds(Number(attentionCountRows[0]?.total ?? 0), paging.attention)

  const [activityRows, attentionRows] = await Promise.all([
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
      .where(activityWhere)
      .orderBy(desc(quoteEvents.createdAt), desc(quoteEvents.id))
      .limit(activityPage.size)
      .offset(activityPage.offset),
    db.select({
      id: quotes.id,
      clientName: quotes.clientName,
      workOrderId: quotes.workOrderId,
      jobAddress: quotes.jobAddress,
      statusTag: quotes.statusTag,
      totalOpens: quoteEngagement.totalOpens,
      forwardingSuspected: quoteEngagement.forwardingSuspected,
      lastOpenedAt: quoteEngagement.lastOpenedAt,
      expiresAt: quotes.expiresAt,
    })
      .from(quotes)
      .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
      .where(attentionWhere)
      .orderBy(
        sql`case
          when ${quotes.statusTag} = 'hot' or coalesce(${quoteEngagement.totalOpens}, 0) >= 2 then 0
          when ${quoteEngagement.forwardingSuspected} = true then 1
          when ${quotes.expiresAt} > ${now} and ${quotes.expiresAt} <= ${expiryCutoff} then 2
          else 3
        end`,
        sql`${quoteEngagement.lastOpenedAt} desc nulls last`,
        desc(quotes.createdAt),
        desc(quotes.id),
      )
      .limit(attentionPage.size)
      .offset(attentionPage.offset),
  ])

  return {
    asOf: now,
    snapshot: {
      activeLinks: Number(snapshotRows[0]?.activeLinks ?? 0),
      viewedLastSevenDays: Number(viewedRows[0]?.viewedLastSevenDays ?? 0),
      viewedLastThirtyDays: Number(viewedRows[0]?.viewedLastThirtyDays ?? 0),
      neverOpened: Number(snapshotRows[0]?.neverOpened ?? 0),
    },
    activity: { ...activityPage, rows: activityRows },
    attention: { ...attentionPage, rows: buildAttentionRows(attentionRows, now) },
  }
}
