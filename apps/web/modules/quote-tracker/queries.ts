import { and, asc, count, desc, eq, gt, ilike, isNotNull, isNull, lte, or, sql, sum, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quoteEngagement, quoteEvents, quoteNotifiedViewers, quoteRecipients, quoteViewerEmails, quotes, tagOverrides } from '@rgtools/db/schema'
import type { QuoteListFilters } from './list-filters'
import { validateEmailGateSettings } from './email-gate'
import { rollupDeviceSessions, rollupGatedEmails } from './viewer-analytics'
import type { StatusTag } from './score'
import { getLatestQuoteAiGuidance } from './ai-guidance'
import { activeQuoteWhere, quoteProgressWhere, trackedPeriodWhere, unopenedAfterThreeDaysWhere, viewedInPeriodWhere } from './quote-scope'

export const EXPIRING_SOON_DAYS = 7
export const GONE_COLD_DAYS = 14

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function listQuotes(filters: QuoteListFilters) {
  const where = listWhere(filters)
  const offset = (filters.page - 1) * filters.size
  const [totalRow] = await db
    .select({ total: count() })
    .from(quotes)
    .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
    .where(where)
  const [kpis] = await db
    .select({
      coldCount: count(sql`case when ${quotes.statusTag} = 'cold' then 1 end`),
      hotCount: count(sql`case when ${quotes.statusTag} = 'hot' then 1 end`),
      warmCount: count(sql`case when ${quotes.statusTag} = 'warm' then 1 end`),
      deadCount: count(sql`case when ${quotes.statusTag} = 'dead' then 1 end`),
      forwardingCount: count(sql`case when ${quoteEngagement.forwardingSuspected} = true then 1 end`),
      totalValue: sum(quotes.quoteValue),
      averageScore: sql<number>`coalesce(round(avg(${quotes.aiScore})), 0)`,
    })
    .from(quotes)
    .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
    .where(where)

  const rows = await db
    .select({
      id: quotes.id,
      shortCode: quotes.shortCode,
      clientName: quotes.clientName,
      companyName: quotes.companyName,
      jobDescription: quotes.jobDescription,
      jobAddress: quotes.jobAddress,
      quoteValue: quotes.quoteValue,
      statusTag: quotes.statusTag,
      aiScore: quotes.aiScore,
      totalOpens: quoteEngagement.totalOpens,
      lastOpenedAt: quoteEngagement.lastOpenedAt,
      forwardingSuspected: quoteEngagement.forwardingSuspected,
      expiresAt: quotes.expiresAt,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
    .where(where)
    .orderBy(...listOrderBy(filters))
    .limit(filters.size)
    .offset(offset)

  const total = totalRow?.total ?? 0

  return {
    rows,
    total,
    pageCount: Math.max(1, Math.ceil(total / filters.size)),
    kpis: {
      coldCount: kpis?.coldCount ?? 0,
      hotCount: kpis?.hotCount ?? 0,
      warmCount: kpis?.warmCount ?? 0,
      deadCount: kpis?.deadCount ?? 0,
      forwardingCount: kpis?.forwardingCount ?? 0,
      totalValue: kpis?.totalValue ?? '0',
      averageScore: Number(kpis?.averageScore ?? 0),
    },
  }
}

export async function getQuoteDetail(id: string) {
  if (!UUID_RE.test(id)) return null

  const [quote] = await db
    .select()
    .from(quotes)
    .where(eq(quotes.id, id))
    .limit(1)

  if (!quote) return null

  const [engagement] = await db
    .select()
    .from(quoteEngagement)
    .where(eq(quoteEngagement.quoteId, id))
    .limit(1)

  const [events, overrides, viewerSessions, aiGuidance] = await Promise.all([
    db
      .select()
      .from(quoteEvents)
      .where(eq(quoteEvents.quoteId, id))
      .orderBy(desc(quoteEvents.createdAt)),
    db
      .select()
      .from(tagOverrides)
      .where(eq(tagOverrides.quoteId, id))
      .orderBy(desc(tagOverrides.createdAt)),
    getViewerSessions(id),
    getLatestQuoteAiGuidance(id),
  ])
  const [recipients, gatedEmailAnalytics, notifiedViewers] = await Promise.all([
    db
      .select()
      .from(quoteRecipients)
      .where(eq(quoteRecipients.quoteId, id))
      .orderBy(asc(quoteRecipients.email)),
    getGatedEmailAnalytics(id),
    getNotifiedViewers(id),
  ])

  return {
    quote,
    engagement: engagement ?? null,
    events,
    overrides,
    viewerSessions,
    recipients,
    gatedEmailAnalytics,
    notifiedViewers,
    aiGuidance,
  }
}

export async function getViewerSessions(quoteId: string) {
  if (!UUID_RE.test(quoteId)) return []

  const events = await db
    .select()
    .from(quoteEvents)
    .where(eq(quoteEvents.quoteId, quoteId))
    .orderBy(asc(quoteEvents.createdAt))

  return rollupDeviceSessions(events)
}

export async function getNotifiedViewers(quoteId: string) {
  if (!UUID_RE.test(quoteId)) return []

  const [notified, opens] = await Promise.all([
    db
      .select({
        ipHash: quoteNotifiedViewers.ipHash,
        userAgentHash: quoteNotifiedViewers.userAgentHash,
        notifiedAt: quoteNotifiedViewers.notifiedAt,
      })
      .from(quoteNotifiedViewers)
      .where(eq(quoteNotifiedViewers.quoteId, quoteId))
      .orderBy(desc(quoteNotifiedViewers.notifiedAt)),
    db
      .select({
        ipHash: quoteEvents.ipHash,
        userAgentHash: quoteEvents.userAgentHash,
        deviceType: quoteEvents.deviceType,
        geoCity: quoteEvents.geoCity,
        geoIsp: quoteEvents.geoIsp,
        createdAt: quoteEvents.createdAt,
      })
      .from(quoteEvents)
      .where(and(eq(quoteEvents.quoteId, quoteId), eq(quoteEvents.eventType, 'open')))
      .orderBy(desc(quoteEvents.createdAt)),
  ])

  const latestEvent = new Map<string, { deviceType: string | null; geoCity: string | null; geoIsp: string | null }>()
  for (const ev of opens) {
    const key = `${ev.ipHash}::${ev.userAgentHash}`
    if (!latestEvent.has(key)) latestEvent.set(key, { deviceType: ev.deviceType, geoCity: ev.geoCity, geoIsp: ev.geoIsp })
  }

  return notified.map((nv) => {
    const detail = latestEvent.get(`${nv.ipHash}::${nv.userAgentHash}`)
    return { ...nv, deviceType: detail?.deviceType ?? null, geoCity: detail?.geoCity ?? null, geoIsp: detail?.geoIsp ?? null }
  })
}

export async function getGatedEmailAnalytics(quoteId: string) {
  if (!UUID_RE.test(quoteId)) return []

  const [events, links] = await Promise.all([
    db
      .select()
      .from(quoteEvents)
      .where(eq(quoteEvents.quoteId, quoteId))
      .orderBy(asc(quoteEvents.createdAt)),
    db
      .select({
        email: quoteViewerEmails.email,
        name: quoteViewerEmails.name,
        sessionId: quoteViewerEmails.sessionId,
      })
      .from(quoteViewerEmails)
      .where(eq(quoteViewerEmails.quoteId, quoteId)),
  ])

  return rollupGatedEmails(events, links)
}

export async function setManualTag(quoteId: string, tag: StatusTag, actorId: string) {
  if (!UUID_RE.test(quoteId) || !UUID_RE.test(actorId)) return

  const [quote] = await db
    .select({ statusTag: quotes.statusTag })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .limit(1)

  if (!quote) return

  await db.insert(tagOverrides).values({
    quoteId,
    overriddenBy: actorId,
    previousTag: quote.statusTag ?? 'cold',
    newTag: tag,
  })

  await db
    .update(quotes)
    .set({ statusTag: tag, updatedAt: new Date() })
    .where(eq(quotes.id, quoteId))
}

export async function updateQuoteScore(quoteId: string, score: number, tag: StatusTag) {
  if (!UUID_RE.test(quoteId)) return

  await db
    .update(quotes)
    .set({ aiScore: score, statusTag: tag, updatedAt: new Date() })
    .where(eq(quotes.id, quoteId))
}

export async function updateQuoteEmailGate(
  quoteId: string,
  input: {
    enabled: boolean
    recipientEmails: string | null
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!UUID_RE.test(quoteId)) return { ok: false, message: 'Quote not found.' }

  const result = validateEmailGateSettings(input)
  if (!result.ok) return result

  await db.transaction(async (tx) => {
    await tx
      .update(quotes)
      .set({
        emailGateEnabled: result.value.enabled,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId))

    await tx
      .delete(quoteRecipients)
      .where(eq(quoteRecipients.quoteId, quoteId))

    if (result.value.enabled && result.value.recipientEmails.length > 0) {
      await tx.insert(quoteRecipients).values(
        result.value.recipientEmails.map((email) => ({
          quoteId,
          email,
        })),
      )
    }
  })

  return { ok: true }
}

function listWhere(filters: QuoteListFilters) {
  const now = new Date()
  const conditions: (SQL | undefined)[] = [trackedPeriodWhere(filters.trackedIn, now)]
  if (filters.outcome === 'open') conditions.push(isNull(quotes.outcome))
  if (filters.outcome === 'won' || filters.outcome === 'lost') {
    conditions.push(eq(quotes.outcome, filters.outcome), isNull(quotes.archivedAt))
  }

  if (filters.status !== 'all') {
    conditions.push(eq(quotes.statusTag, filters.status))
  }

  if (filters.linkStatus === 'active') {
    conditions.push(activeQuoteWhere(now))
  }

  if (filters.linkStatus === 'expired') {
    conditions.push(or(isNotNull(quotes.archivedAt), lte(quotes.expiresAt, sql`now()`)))
  }

  if (filters.activity === 'expiring') {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + EXPIRING_SOON_DAYS)
    conditions.push(isNull(quotes.archivedAt))
    conditions.push(or(eq(quotes.statusTag, 'hot'), eq(quotes.statusTag, 'warm')))
    conditions.push(gt(quotes.expiresAt, sql`now()`))
    conditions.push(lte(quotes.expiresAt, cutoff))
  } else if (filters.activity === 'unopened_3_days') {
    conditions.push(unopenedAfterThreeDaysWhere(now))
  } else if (filters.activity === 'unopened_under_3_days') {
    conditions.push(quoteProgressWhere('waiting', now))
  } else if (filters.activity === 'opened_once') {
    conditions.push(quoteProgressWhere('once', now))
  } else if (filters.activity === 'opened_multiple') {
    conditions.push(quoteProgressWhere('repeat', now))
  } else if (filters.activity === 'viewed') {
    conditions.push(viewedInPeriodWhere(filters.trackedIn, now))
  } else if (filters.activity === 'never_opened') {
    conditions.push(isNull(quotes.archivedAt))
    conditions.push(or(isNull(quoteEngagement.totalOpens), eq(quoteEngagement.totalOpens, 0)))
  } else if (filters.activity === 'forwarding') {
    conditions.push(eq(quoteEngagement.forwardingSuspected, true))
  } else if (filters.activity === 'gone_cold') {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - GONE_COLD_DAYS)
    conditions.push(or(eq(quotes.statusTag, 'hot'), eq(quotes.statusTag, 'warm')))
    conditions.push(or(isNull(quoteEngagement.lastOpenedAt), lte(quoteEngagement.lastOpenedAt, cutoff)))
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`
    conditions.push(or(
      ilike(quotes.clientName, pattern),
      ilike(quotes.companyName, pattern),
      ilike(quotes.shortCode, pattern),
      ilike(quotes.jobDescription, pattern),
      ilike(quotes.jobAddress, pattern),
    ))
  }

  return conditions.length > 0 ? and(...conditions) : undefined
}

function listOrderBy(filters: QuoteListFilters) {
  if (filters.sort === 'client_asc') return [asc(quotes.clientName), desc(quotes.createdAt)]
  if (filters.sort === 'client_desc') return [desc(quotes.clientName), desc(quotes.createdAt)]
  if (filters.sort === 'value_asc') return [asc(sql<number>`cast(${quotes.quoteValue} as numeric)`), desc(quotes.createdAt)]
  if (filters.sort === 'value_desc') return [desc(sql<number>`cast(${quotes.quoteValue} as numeric)`), desc(quotes.createdAt)]
  if (filters.sort === 'interest_asc') return [asc(sql<number>`coalesce(${quotes.aiScore}, 0)`), desc(quotes.createdAt)]
  if (filters.sort === 'interest_desc') return [desc(sql<number>`coalesce(${quotes.aiScore}, 0)`), desc(quotes.createdAt)]

  return [sql`${quoteEngagement.lastOpenedAt} desc nulls last`, desc(quotes.createdAt)]
}
