import { sql } from 'drizzle-orm'
import { quotes } from '@rgtools/db/schema'
import { type StatusTag, ENGAGEMENT_THRESHOLDS } from './score'

// Correlated aliases keep these expressions safe in queries whose outer table
// is quote_events (such as the overview's activity feed).
const events = sql`from quote_events as stats_events where stats_events.quote_id = ${quotes.id}`
const rollup = sql`from quote_engagement as stats_engagement where stats_engagement.quote_id = ${quotes.id}`
// Independent membership sets let PostgreSQL reuse event scans across quotes.
// In particular, never-opened quotes usually have neither a rollup nor events.
const hasEvents = sql`${quotes.id} in (select quote_id from quote_events)`
const opens = sql<number>`coalesce((select stats_engagement.total_opens ${rollup}), case when ${hasEvents} then (select count(*) ${events} and stats_events.event_type = 'open') else 0 end, 0)`
const time = sql<number>`coalesce((select stats_engagement.total_time_ms ${rollup}), case when ${hasEvents} then (select sum(stats_events.duration_ms) ${events} and stats_events.event_type = 'close') else 0 end, 0)`
const scroll = sql<number>`coalesce((select stats_engagement.max_scroll_depth ${rollup}), case when ${hasEvents} then (select max(stats_events.scroll_depth) ${events}) else 0 end, 0)`
const devices = sql<number>`coalesce((select stats_engagement.unique_devices ${rollup}), case when ${hasEvents} then (select count(distinct stats_events.device_type) ${events}) else 0 end, 0)`
const forwarded = sql<boolean>`coalesce((select stats_engagement.forwarding_suspected ${rollup}), false)`
const cta = sql<boolean>`${quotes.id} in (select quote_id from quote_events where event_type in ('cta', 'download'))`
const returned = sql<boolean>`${quotes.id} in (select quote_id from quote_events where event_type = 'open'
  group by quote_id having count(distinct substring(cast(created_at at time zone 'UTC' as text), 1, 10)) >= 2)`

// Read-time derivation keeps age-only changes (Dead after three days), filters,
// ordering and aggregates fresh without writing while a staff page renders.
export function currentQuoteStats(now = new Date()) {
  const t = ENGAGEMENT_THRESHOLDS
  const computedStatus = sql<StatusTag>`case
    when (${time} >= ${t.quickTime} and ${scroll} >= ${t.quickScroll})
      or (${time} >= ${t.steadyTime} and ${scroll} >= ${t.steadyScroll})
      or (${opens} >= 2 and (${time} >= ${t.repeatTime} or ${scroll} >= ${t.repeatScroll}))
      or ${returned} or ${cta} or ${forwarded} or ${devices} >= 2 then 'hot'
    when ${opens} > 0 and (${time} >= ${t.warmTime} or ${scroll} >= ${t.warmScroll}) then 'warm'
    when ${opens} > 0 then 'cold'
    when ${quotes.createdAt} <= ${new Date(now.getTime() - 3 * 86400000).toISOString()} then 'dead'
    else 'cold' end`
  return {
    statusTag: sql<StatusTag>`coalesce((select cast(stats_override.new_tag as text) from tag_overrides as stats_override
      where stats_override.quote_id = ${quotes.id}
      order by stats_override.created_at desc, stats_override.id desc limit 1), ${computedStatus})`,
    aiScore: sql<number>`least(100, greatest(0, round(${opens} * 10 + greatest(0, ${scroll}) / 100.0 * 20
      + ${devices} * 10 + case when ${forwarded} then 15 else 0 end + case when ${cta} then 25 else 0 end)))`.mapWith(Number),
    totalOpens: opens.mapWith(Number),
  }
}
