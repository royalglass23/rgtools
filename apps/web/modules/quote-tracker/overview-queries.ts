import { and, count, countDistinct, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quoteEngagement, quoteEvents, quotes } from '@rgtools/db/schema'
import { buildAttentionRows, buildEngagementPreview, pageBounds, type OverviewPaging } from './overview'
import { DAY_MS, trackedSince, type TrackedPeriod } from './quote-period'
import { activeQuoteWhere, trackedPeriodWhere, unopenedAfterThreeDaysWhere, viewedInPeriodWhere } from './quote-scope'

export async function getTrackedQuoteOverview(paging: OverviewPaging, period: TrackedPeriod = '30', now = new Date()) {
  const active = and(activeQuoteWhere(now), isNull(quotes.outcome), trackedPeriodWhere(period, now))!
  const since = trackedSince(period, now)
  const expiryCutoff = new Date(now.getTime() + 7 * DAY_MS)
  const activityWhere = and(active, inArray(quoteEvents.eventType, ['open', 'download', 'cta']), lte(quoteEvents.createdAt, now), since ? gte(quoteEvents.createdAt, since) : undefined)!
  const attentionWhere = and(active, or(
    eq(quotes.statusTag, 'hot'),
    gte(quoteEngagement.totalOpens, 2),
    eq(quoteEngagement.forwardingSuspected, true),
    and(gt(quotes.expiresAt, now), lte(quotes.expiresAt, expiryCutoff)),
    unopenedAfterThreeDaysWhere(now),
  ))!

  const [snapshotRows, activityCountRows, attentionCountRows] = await Promise.all([
    db.select({
      activeLinks: count(),
      totalValue: sql<string>`coalesce(sum(${quotes.quoteValue}), 0)`,
      hotCount: sql<number>`count(*) filter (where ${quotes.statusTag} = 'hot')`,
      warmCount: sql<number>`count(*) filter (where ${quotes.statusTag} = 'warm')`,
      coldCount: sql<number>`count(*) filter (where ${quotes.statusTag} = 'cold')`,
      unopenedAfterThreeDays: sql<number>`count(*) filter (where ${unopenedAfterThreeDaysWhere(now)})`,
      forwardingCount: sql<number>`count(*) filter (where ${quoteEngagement.forwardingSuspected} = true)`,
      viewedCount: sql<number>`count(*) filter (where ${viewedInPeriodWhere(period, now)})`,
    })
      .from(quotes)
      .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
      .where(active),
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
      totalOpens: quoteEngagement.totalOpens,
      uniqueSessions: quoteEngagement.uniqueSessions,
      totalTimeMs: quoteEngagement.totalTimeMs,
      maxScrollDepth: quoteEngagement.maxScrollDepth,
      uniqueDevices: quoteEngagement.uniqueDevices,
      forwardingSuspected: quoteEngagement.forwardingSuspected,
      eventType: quoteEvents.eventType,
      createdAt: quoteEvents.createdAt,
    })
      .from(quoteEvents)
      .innerJoin(quotes, eq(quotes.id, quoteEvents.quoteId))
      .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
      .where(activityWhere)
      .orderBy(desc(quoteEvents.createdAt), desc(quoteEvents.id))
      .limit(activityPage.size)
      .offset(activityPage.offset),
    db.select({
      id: quotes.id,
      createdAt: quotes.createdAt,
      outcome: quotes.outcome,
      clientName: quotes.clientName,
      workOrderId: quotes.workOrderId,
      jobAddress: quotes.jobAddress,
      statusTag: quotes.statusTag,
      totalOpens: quoteEngagement.totalOpens,
      uniqueSessions: quoteEngagement.uniqueSessions,
      totalTimeMs: quoteEngagement.totalTimeMs,
      maxScrollDepth: quoteEngagement.maxScrollDepth,
      uniqueDevices: quoteEngagement.uniqueDevices,
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

  const visibleQuoteIds = [...new Set([
    ...activityRows.map((row) => row.quoteId),
    ...attentionRows.map((row) => row.id),
  ])]
  const eventSummaries = visibleQuoteIds.length === 0 ? [] : await db.select({
    quoteId: quoteEvents.quoteId,
    totalOpens: sql<number>`count(*) filter (where ${quoteEvents.eventType} = 'open')`,
    uniqueSessions: countDistinct(quoteEvents.sessionId),
    totalTimeMs: sql<number>`coalesce(sum(${quoteEvents.durationMs}), 0)`,
    maxScrollDepth: sql<number>`coalesce(max(${quoteEvents.scrollDepth}), 0)`,
    uniqueDevices: sql<number>`count(distinct ${quoteEvents.deviceType})`,
    hasCta: sql<boolean>`coalesce(bool_or(${quoteEvents.eventType} in ('cta', 'download')), false)`,
  })
    .from(quoteEvents)
    .where(inArray(quoteEvents.quoteId, visibleQuoteIds))
    .groupBy(quoteEvents.quoteId)
  const eventSummaryByQuote = new Map(eventSummaries.map((row) => [row.quoteId, {
    totalOpens: Number(row.totalOpens),
    uniqueSessions: Number(row.uniqueSessions),
    totalTimeMs: Number(row.totalTimeMs),
    maxScrollDepth: Number(row.maxScrollDepth),
    uniqueDevices: Number(row.uniqueDevices),
    hasCta: row.hasCta,
  }]))

  function previewFor(row: typeof activityRows[number] | typeof attentionRows[number], quoteId: string) {
    const engagement = row.totalOpens === null ? null : {
      totalOpens: row.totalOpens,
      uniqueSessions: row.uniqueSessions ?? 0,
      totalTimeMs: row.totalTimeMs ?? 0,
      maxScrollDepth: row.maxScrollDepth ?? 0,
      uniqueDevices: row.uniqueDevices ?? 0,
      forwardingSuspected: row.forwardingSuspected ?? false,
    }
    return buildEngagementPreview(engagement, eventSummaryByQuote.get(quoteId))
  }

  return {
    asOf: now,
    snapshot: {
      activeLinks: Number(snapshotRows[0]?.activeLinks ?? 0),
      totalValue: String(snapshotRows[0]?.totalValue ?? '0'),
      hotCount: Number(snapshotRows[0]?.hotCount ?? 0),
      warmCount: Number(snapshotRows[0]?.warmCount ?? 0),
      coldCount: Number(snapshotRows[0]?.coldCount ?? 0),
      unopenedAfterThreeDays: Number(snapshotRows[0]?.unopenedAfterThreeDays ?? 0),
      forwardingCount: Number(snapshotRows[0]?.forwardingCount ?? 0),
      viewedCount: Number(snapshotRows[0]?.viewedCount ?? 0),
    },
    activity: { ...activityPage, rows: activityRows.map((row) => ({ ...row, engagementPreview: previewFor(row, row.quoteId) })) },
    attention: { ...attentionPage, rows: buildAttentionRows(attentionRows, now).map((row) => ({ ...row, engagementPreview: previewFor(row, row.id) })) },
  }
}
