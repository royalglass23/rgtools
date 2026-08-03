import { and, count, eq, gt, gte, isNotNull, isNull, lt, lte, ne, or, sql, sum } from 'drizzle-orm'
import { db } from '@/lib/db'
import { leads } from '@rgtools/db/schema-leads'
import { quoteEngagement, quotes } from '@rgtools/db/schema'
import { STALE_LEAD_DAYS } from '@/modules/leads/queries'
import { EXPIRING_SOON_DAYS, GONE_COLD_DAYS } from '@/modules/quote-tracker/queries'

export const ROLLING_WINDOW_DAYS = 30
export const CHART_WEEKS = 8

export type SparkPoint = { day: string; value: number }
export type WeekLeads = { week: string; count: number }
export type WeekPipeline = { week: string; hot: number; warm: number; cold: number; dead: number }

export async function getDashboardChartData() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - CHART_WEEKS * 7)

  const [leadsRows, quotesRows] = await Promise.all([
    db
      .select({ createdAt: leads.createdAt })
      .from(leads)
      .where(and(isNull(leads.archivedAt), gte(leads.createdAt, cutoff))),
    db
      .select({ statusTag: quotes.statusTag, createdAt: quotes.createdAt })
      .from(quotes)
      .where(and(isNull(quotes.archivedAt), gte(quotes.createdAt, cutoff))),
  ])

  const weekBuckets = buildLastNWeeks(CHART_WEEKS)

  const leadCounts = new Map<string, number>()
  for (const row of leadsRows) {
    const w = toIsoWeek(row.createdAt)
    leadCounts.set(w, (leadCounts.get(w) ?? 0) + 1)
  }
  const leadsPerWeek: WeekLeads[] = weekBuckets.map((week) => ({ week, count: leadCounts.get(week) ?? 0 }))

  type StatusBucket = { hot: number; warm: number; cold: number; dead: number }
  const pipelineCounts = new Map<string, StatusBucket>()
  for (const row of quotesRows) {
    const w = toIsoWeek(row.createdAt)
    const b = pipelineCounts.get(w) ?? { hot: 0, warm: 0, cold: 0, dead: 0 }
    if (row.statusTag === 'hot') b.hot++
    else if (row.statusTag === 'warm') b.warm++
    else if (row.statusTag === 'cold') b.cold++
    else if (row.statusTag === 'dead') b.dead++
    pipelineCounts.set(w, b)
  }
  const pipelineByWeek: WeekPipeline[] = weekBuckets.map((week) => ({
    week,
    ...(pipelineCounts.get(week) ?? { hot: 0, warm: 0, cold: 0, dead: 0 }),
  }))

  return {
    leadsPerWeek,
    pipelineByWeek,
  }
}

function toIsoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayOfWeek = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function buildLastNWeeks(n: number): string[] {
  const now = new Date()
  const dayOfWeek = now.getUTCDay() || 7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOfWeek + 1))
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(d.getUTCDate() - (n - 1 - i) * 7)
    return toIsoWeek(d)
  })
}

export async function getDashboardKpis() {
  const cutoff30 = new Date()
  cutoff30.setDate(cutoff30.getDate() - ROLLING_WINDOW_DAYS)
  const cutoff60 = new Date()
  cutoff60.setDate(cutoff60.getDate() - ROLLING_WINDOW_DAYS * 2)

  const [[pipelineRow], [outcomeRow], leadsCurrentRows, leadsPriorRows, pipelineSparkRows] = await Promise.all([
    db
      .select({ pipelineValue: sum(quotes.quoteValue) })
      .from(quotes)
      .where(
        and(
          isNull(quotes.archivedAt),
          gt(quotes.expiresAt, sql`now()`),
          or(eq(quotes.statusTag, 'hot'), eq(quotes.statusTag, 'warm')),
        ),
      ),
    db
      .select({ won: count(sql`case when ${quotes.outcome} = 'won' then 1 end`), total: count() })
      .from(quotes)
      .where(isNotNull(quotes.outcome)),
    db
      .select({ servicem8JobUuid: leads.servicem8JobUuid, seedScore: leads.seedScore, createdAt: leads.createdAt })
      .from(leads)
      .where(
        and(
          isNull(leads.archivedAt),
          gte(leads.createdAt, cutoff30),
        ),
      ),
    db
      .select({ createdAt: leads.createdAt })
      .from(leads)
      .where(
        and(
          isNull(leads.archivedAt),
          gte(leads.createdAt, cutoff60),
          lt(leads.createdAt, cutoff30),
        ),
      ),
    db
      .select({ quoteValue: quotes.quoteValue, createdAt: quotes.createdAt })
      .from(quotes)
      .where(
        and(
          isNull(quotes.archivedAt),
          gt(quotes.expiresAt, sql`now()`),
          or(eq(quotes.statusTag, 'hot'), eq(quotes.statusTag, 'warm')),
          gte(quotes.createdAt, cutoff30),
        ),
      ),
  ])

  const priorCount = leadsPriorRows.length
  const currentCount = leadsCurrentRows.length
  const volumeTrend = priorCount === 0 ? 0 : Math.round(((currentCount - priorCount) / priorCount) * 100)

  const wonTotal = outcomeRow?.total ?? 0
  const conversionRate = wonTotal === 0 ? 0 : Math.round(((outcomeRow?.won ?? 0) / wonTotal) * 100)

  return {
    pipelineValue: parseFloat(pipelineRow?.pipelineValue ?? '0') || 0,
    conversionRate,
    volumeTrend,
    leadVolume: currentCount,
    pipelineSparkline: buildValueSparkline(pipelineSparkRows, ROLLING_WINDOW_DAYS),
    conversionSparkline: [] as SparkPoint[],
    volumeSparkline: buildCountSparkline(leadsCurrentRows, ROLLING_WINDOW_DAYS),
  }
}

function buildCountSparkline(rows: Array<{ createdAt: Date }>, days: number): SparkPoint[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const day = row.createdAt.toISOString().slice(0, 10)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return buildDayBuckets(days).map((day) => ({ day, value: counts.get(day) ?? 0 }))
}

function buildValueSparkline(rows: Array<{ quoteValue: string | null; createdAt: Date }>, days: number): SparkPoint[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const day = row.createdAt.toISOString().slice(0, 10)
    totals.set(day, (totals.get(day) ?? 0) + (parseFloat(row.quoteValue ?? '0') || 0))
  }
  return buildDayBuckets(days).map((day) => ({ day, value: Math.round(totals.get(day) ?? 0) }))
}

function buildConversionSparkline(
  rows: Array<{ servicem8JobUuid: string | null; seedScore: number | null; createdAt: Date }>,
  days: number,
): SparkPoint[] {
  const buckets = new Map<string, { scored: number; converted: number }>()
  for (const row of rows) {
    if (row.seedScore === null) continue
    const day = row.createdAt.toISOString().slice(0, 10)
    const b = buckets.get(day) ?? { scored: 0, converted: 0 }
    b.scored++
    if (row.servicem8JobUuid !== null) b.converted++
    buckets.set(day, b)
  }
  return buildDayBuckets(days).map((day) => {
    const b = buckets.get(day)
    return { day, value: b ? Math.round((b.converted / b.scored) * 100) : 0 }
  })
}

function buildDayBuckets(days: number): string[] {
  const now = new Date()
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (days - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

export async function getDashboardActionCounts() {
  const staleCutoff = new Date()
  staleCutoff.setDate(staleCutoff.getDate() - STALE_LEAD_DAYS)

  const expiryCutoff = new Date()
  expiryCutoff.setDate(expiryCutoff.getDate() + EXPIRING_SOON_DAYS)

  const coldCutoff = new Date()
  coldCutoff.setDate(coldCutoff.getDate() - GONE_COLD_DAYS)

  const [[staleRow], [unsyncedRow], [expiringRow], [neverOpenedRow], [forwardingRow], [goneColdRow]] = await Promise.all([
    db.select({ total: count() })
      .from(leads)
      .where(and(
        isNull(leads.archivedAt),
        isNull(leads.servicem8JobUuid),
        ne(leads.syncStatus, 'sync_failed'),
        lte(leads.createdAt, staleCutoff),
      )),
    db.select({ total: count() })
      .from(leads)
      .where(and(
        isNull(leads.archivedAt),
        or(eq(leads.tier, 'A'), eq(leads.tier, 'B')),
        isNull(leads.servicem8JobUuid),
      )),
    db.select({ total: count() })
      .from(quotes)
      .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
      .where(and(
        isNull(quotes.archivedAt),
        or(eq(quotes.statusTag, 'hot'), eq(quotes.statusTag, 'warm')),
        gt(quotes.expiresAt, sql`now()`),
        lte(quotes.expiresAt, expiryCutoff),
      )),
    db.select({ total: count() })
      .from(quotes)
      .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
      .where(and(
        isNull(quotes.archivedAt),
        or(isNull(quoteEngagement.totalOpens), eq(quoteEngagement.totalOpens, 0)),
      )),
    db.select({ total: count() })
      .from(quotes)
      .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
      .where(and(
        isNull(quotes.archivedAt),
        gt(quotes.expiresAt, sql`now()`),
        eq(quoteEngagement.forwardingSuspected, true),
      )),
    db.select({ total: count() })
      .from(quotes)
      .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
      .where(and(
        isNull(quotes.archivedAt),
        or(isNull(quotes.expiresAt), gt(quotes.expiresAt, sql`now()`)),
        or(eq(quotes.statusTag, 'hot'), eq(quotes.statusTag, 'warm')),
        or(isNull(quoteEngagement.lastOpenedAt), lte(quoteEngagement.lastOpenedAt, coldCutoff)),
      )),
  ])

  return {
    staleLeads: staleRow?.total ?? 0,
    unsynced: unsyncedRow?.total ?? 0,
    expiringSoon: expiringRow?.total ?? 0,
    neverOpened: neverOpenedRow?.total ?? 0,
    forwarding: forwardingRow?.total ?? 0,
    goneCold: goneColdRow?.total ?? 0,
  }
}
