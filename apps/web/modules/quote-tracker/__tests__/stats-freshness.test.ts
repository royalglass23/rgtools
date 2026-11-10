// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, beforeEach, expect, it as test, vi } from 'vitest'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { listQuotes } from '../queries'
import { parseQuoteListFilters } from '../list-filters'
import { getTrackedQuoteOverview } from '../overview-queries'
import { parseOverviewPaging } from '../overview'

// Exercise the actual generated SELECTs in an isolated SQL engine. This covers
// relational behavior, not PostgreSQL deployment/driver compatibility.
interface Statement {
  setReturnArrays(value: boolean): void
  all(...params: unknown[]): unknown[][]
  run(...params: unknown[]): void
}
interface Database {
  exec(sql: string): void
  function(name: string, fn: (...args: number[]) => number): void
  prepare(sql: string): Statement
  close(): void
}
// The app still supports Node 20. The optional SQL-engine tests use Node 24's
// built-in SQLite; the rest of the suite remains runnable on older Node versions.
const DatabaseSync = Number(process.versions.node.split('.')[0]) >= 24
  ? (createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Database }).DatabaseSync
  : undefined
const it = test.skipIf(!DatabaseSync)
let database: Database
const testDb = drizzle(async (query, params) => {
  const statement = database.prepare(query.replace(/\$\d+/g, '?').replaceAll(" at time zone 'UTC'", '').replaceAll('::text', '').replaceAll('json_build_object', 'json_object').replaceAll('bool_or(', 'max('))
  statement.setReturnArrays(true)
  return { rows: statement.all(...params.map(value => value instanceof Date ? value.toISOString() : typeof value === 'boolean' ? Number(value) : value)).map(row => row.map(value => (
    typeof value === 'string' && value.startsWith('{') ? JSON.parse(value) : value
  ))) }
})
vi.mock('@/lib/db', () => ({ get db() { return testDb } }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-10T00:00:00Z'))
  if (!DatabaseSync) throw new Error('The isolated SQL tests require Node 24 or newer.')
  database = new DatabaseSync(':memory:')
  database.function('greatest', Math.max)
  database.function('least', Math.min)
  database.exec(`
    create table quotes (id text, short_code text, client_name text, company_name text,
      job_description text, job_address text, quote_value numeric, status_tag text,
      ai_score integer, expires_at text, created_at text, archived_at text, outcome text, work_order_id text);
    create table quote_engagement (quote_id text, total_opens integer, total_time_ms integer,
      max_scroll_depth integer, unique_sessions integer, unique_devices integer,
      forwarding_suspected boolean, last_opened_at text);
    create table quote_events (quote_id text, event_type text, created_at text,
      duration_ms integer, scroll_depth integer, session_id text, device_type text, id text);
    create table tag_overrides (id text, quote_id text, new_tag text, created_at text);
    insert into quotes (id, client_name, status_tag, ai_score, created_at)
      values ('q1', 'Engaged customer', 'cold', 0, '2026-11-01T00:00:00.000Z');
    insert into quote_engagement values ('q1', 1, 30000, 75, 1, 1, false, '2026-11-10T00:00:00.000Z');
  `)
})
afterEach(() => { database.close(); vi.useRealTimers() })

it('shows current engagement score and status without ever opening quote details', async () => {
  const result = await listQuotes(parseQuoteListFilters({ trackedIn: 'all', outcome: 'all', linkStatus: 'all' }))
  expect(result.rows[0]).toMatchObject({ aiScore: 35, statusTag: 'hot', totalOpens: 1 })
  expect(result.kpis).toMatchObject({ hotCount: 1, coldCount: 0, averageScore: 35 })
})

it('filters, sorts and counts by current engagement instead of saved scores', async () => {
  database.exec(`insert into quotes (id, client_name, status_tag, ai_score, created_at)
    values ('q2', 'Old saved Hot', 'hot', 100, '2026-11-01T00:00:00.000Z');`)
  const result = await listQuotes(parseQuoteListFilters({ trackedIn: 'all', outcome: 'all', linkStatus: 'all', status: 'hot', sort: 'interest_desc' }))
  expect(result.total).toBe(1)
  expect(result.rows.map(row => row.id)).toEqual(['q1'])
  expect(result.kpis.hotCount).toBe(1)
  const sorted = await listQuotes(parseQuoteListFilters({ trackedIn: 'all', outcome: 'all', linkStatus: 'all', sort: 'interest_desc', size: '5' }))
  expect(sorted.rows.map(row => row.id)).toEqual(['q1', 'q2'])
})

it('preserves the newest manual status override without freezing the score', async () => {
  database.exec(`insert into tag_overrides values
    ('a', 'q1', 'hot', '2026-11-01'), ('b', 'q1', 'warm', '2026-11-02');`)
  const result = await listQuotes(parseQuoteListFilters({ trackedIn: 'all', outcome: 'all', linkStatus: 'all', status: 'warm' }))
  expect(result.rows[0]).toMatchObject({ id: 'q1', statusTag: 'warm', aiScore: 35 })
  expect(result.kpis.warmCount).toBe(1)
})

it('updates after new engagement and classifies old unopened quotes without a detail visit', async () => {
  database.exec(`delete from quote_engagement;`)
  const filters = parseQuoteListFilters({ trackedIn: 'all', outcome: 'all', linkStatus: 'all' })
  expect((await listQuotes(filters)).rows[0]).toMatchObject({ statusTag: 'dead', aiScore: 0 })
  database.exec(`insert into quote_engagement values ('q1', 1, 30000, 75, 1, 1, false, '2026-11-10');`)
  expect((await listQuotes(filters)).rows[0]).toMatchObject({ statusTag: 'hot', aiScore: 35, totalOpens: 1 })
})

it('includes return visits and CTA signals and falls back to events without a rollup', async () => {
  database.exec(`delete from quote_engagement;
    insert into quote_events (quote_id, event_type, created_at, duration_ms, scroll_depth, session_id, device_type) values ('q1', 'open', '2026-11-08T01:00:00Z', null, null, 's1', 'desktop'),
      ('q1', 'open', '2026-11-09T01:00:00Z', null, null, 's2', 'desktop'),
      ('q1', 'download', '2026-11-09T01:01:00Z', null, null, 's2', 'desktop');`)
  const result = await listQuotes(parseQuoteListFilters({ trackedIn: 'all', outcome: 'all', linkStatus: 'all' }))
  expect(result.rows[0]).toMatchObject({ statusTag: 'hot', aiScore: 55, totalOpens: 2 })
})

it('uses current Hot status for overview totals and attention before any detail visit', async () => {
  const result = await getTrackedQuoteOverview(parseOverviewPaging({}), 'all', new Date('2026-11-10T00:00:00Z'))
  expect(result.snapshot).toMatchObject({ hotCount: 1, coldCount: 0 })
  expect(result.attention.rows[0]).toMatchObject({ id: 'q1', statusTag: 'hot' })
})

it('keeps repeat-open progress, attention reasons and previews consistent without an engagement summary', async () => {
  database.exec(`delete from quote_engagement;
    insert into quote_events (quote_id, event_type, created_at, session_id, device_type) values
      ('q1', 'open', '2026-11-08T01:00:00Z', 's1', 'desktop'),
      ('q1', 'open', '2026-11-08T02:00:00Z', 's2', 'desktop');`)
  const result = await getTrackedQuoteOverview(parseOverviewPaging({}), 'all', new Date('2026-11-10T00:00:00Z'))
  expect(result.progress.find(group => group.id === 'repeat')?.count).toBe(1)
  expect(result.attention.total).toBe(1)
  expect(result.attention.rows[0]).toMatchObject({
    id: 'q1', totalOpens: 2, reasons: ['Opened more than once'],
    engagementPreview: { totalOpens: 2, uniqueSessions: 2, interestScore: 30 },
  })
})

it('prioritises repeat opens without a summary ahead of expiry-only attention', async () => {
  database.exec(`delete from quote_engagement;
    insert into quote_events (quote_id, event_type, created_at, session_id, device_type) values
      ('q1', 'open', '2026-11-08T01:00:00Z', 's1', 'desktop'),
      ('q1', 'open', '2026-11-08T02:00:00Z', 's2', 'desktop');
    insert into quotes (id, client_name, created_at, expires_at) values
      ('q2', 'Expiring quote', '2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z');`)
  const result = await getTrackedQuoteOverview(parseOverviewPaging({}), 'all', new Date('2026-11-10T00:00:00Z'))
  expect(result.attention.rows.map(row => row.id)).toEqual(['q1', 'q2'])
})

it.each([
  { opens: 1, time: 0, scroll: 0, devices: 1, forwarding: 0, status: 'cold', score: 20 },
  { opens: 1, time: 20000, scroll: 0, devices: 1, forwarding: 0, status: 'warm', score: 20 },
  { opens: 1, time: 0, scroll: 30, devices: 1, forwarding: 0, status: 'warm', score: 26 },
  { opens: 1, time: 29999, scroll: 75, devices: 1, forwarding: 0, status: 'warm', score: 35 },
  { opens: 1, time: 30000, scroll: 75, devices: 1, forwarding: 0, status: 'hot', score: 35 },
  { opens: 1, time: 45000, scroll: 50, devices: 1, forwarding: 0, status: 'hot', score: 30 },
  { opens: 2, time: 0, scroll: 30, devices: 1, forwarding: 0, status: 'hot', score: 36 },
  { opens: 1, time: 0, scroll: 0, devices: 2, forwarding: 0, status: 'hot', score: 30 },
  { opens: 1, time: 0, scroll: 0, devices: 1, forwarding: 1, status: 'hot', score: 35 },
  { opens: 20, time: 0, scroll: 100, devices: 3, forwarding: 1, status: 'hot', score: 100 },
])('keeps existing scoring rules for $status at $time ms / $scroll% scroll', async fixture => {
  database.prepare(`update quote_engagement set total_opens=?, total_time_ms=?, max_scroll_depth=?,
    unique_devices=?, forwarding_suspected=?`).run(fixture.opens, fixture.time, fixture.scroll, fixture.devices, fixture.forwarding)
  const result = await listQuotes(parseQuoteListFilters({ trackedIn: 'all', outcome: 'all', linkStatus: 'all' }))
  expect(result.rows[0]).toMatchObject({ aiScore: fixture.score, statusTag: fixture.status })
})
