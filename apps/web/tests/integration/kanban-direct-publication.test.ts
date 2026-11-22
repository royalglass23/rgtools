import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { eq, sql } from 'drizzle-orm'
import { auditLog, settings } from '@rgtools/db/schema'
import { PUBLICATION_ENTITY, PUBLICATION_SETTING, parsePublication } from '@/modules/kanban/publication'
import { publishWorkOrders, readLatestPublication, readPublicationHistory } from '@/modules/kanban/publication-store'
import { publicationFixture } from '@/modules/kanban/__tests__/publication-fixture'

const rawUrl = process.env.RG408_TEST_DATABASE_URL
const enabled = rawUrl === 'postgresql://rg408@127.0.0.1:55442/rg408_direct?sslmode=disable'
let pool: Pool, database: ReturnType<typeof drizzle>
const make = (minute = 1, id = randomUUID()) => parsePublication({ ...publicationFixture(), publicationId: id, generatedAt: `2026-11-20T00:${String(minute).padStart(2, '0')}:00.000Z` }, new Date('2026-11-20T01:00:00.000Z'))
type FixtureTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0]
async function fixtureWrite(work: (tx: FixtureTransaction) => Promise<unknown>) {
  return database.transaction(async tx => {
    const sentinel = process.env.RG408_TEST_DATABASE_SENTINEL
    if (!sentinel || !/^[a-f0-9]{64}$/.test(sentinel)) throw new Error('Owned SQL fixture sentinel is required before mutation.')
    const proof = await tx.execute(sql`SELECT current_database() AS database, host(inet_server_addr()) AS host, inet_server_port() AS port, current_user AS role, sentinel FROM rgtools_e2e.database_sentinel WHERE id=1`)
    const row = proof.rows[0]
    if (row?.database !== 'rg408_direct' || row.host !== '127.0.0.1' || row.port !== 55442 || row.role !== 'rg408' || row.sentinel !== sentinel) throw new Error('Refusing fixture mutation: database identity or sentinel mismatch.')
    return work(tx)
  })
}

describe.skipIf(!enabled)('direct publications on fresh fictional PostgreSQL only', () => {
  beforeAll(async () => {
    neonConfig.webSocketConstructor = WebSocket; neonConfig.wsProxy = () => '127.0.0.1:55443'; neonConfig.useSecureWebSocket = false; neonConfig.pipelineConnect = false
    pool = new Pool({ connectionString: rawUrl! }); database = drizzle(pool)
    // Marker must be provisioned separately in the verified task-owned database.
    await fixtureWrite(async tx => {
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY)`)
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE NOT NULL, value text NOT NULL, updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now())`)
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id) ON DELETE SET NULL, entity_type text, action text NOT NULL, target_id uuid, detail jsonb, ip_address text, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`)
    })
  })
  beforeEach(async () => { await fixtureWrite(async tx => {
    await tx.delete(auditLog).where(eq(auditLog.entityType, PUBLICATION_ENTITY))
    await tx.delete(settings).where(eq(settings.key, PUBLICATION_SETTING))
  }) })
  afterAll(async () => { if (pool) await pool.end() })
  it('serializes bootstrap/delivery retries, including archived dedupe, and records one initial snapshot', async () => {
    const value = make(); value.tables.jobs.push({ id: 'second-stable-job', cells: ['R260002', '', '', '', ''] })
    const retry = structuredClone(value); retry.tables.jobs.reverse()
    const results = await Promise.all([publishWorkOrders(value, database), publishWorkOrders(retry, database)])
    expect(results.map(result => result.duplicate).sort()).toEqual([false, true]); expect((await database.select().from(auditLog))).toHaveLength(1)
    const event = (await database.select().from(auditLog))[0]; expect(event.actorId).toBeNull(); expect(event.detail).toMatchObject({ initial: true, tableCounts: { jobs: 2, products: 1 } })
    await fixtureWrite(tx => tx.update(auditLog).set({ archivedAt: new Date() }).where(eq(auditLog.id, value.publicationId)))
    expect(await publishWorkOrders(value, database)).toMatchObject({ duplicate: true }); expect((await readPublicationHistory(1, database)).events).toHaveLength(1)
  })
  it('rejects conflicting same-ID races and keeps the winning snapshot', async () => {
    const a = make(), b = structuredClone(a); b.tables.jobs[0].cells[1] = 'Another fictional customer'
    const results = await Promise.all([publishWorkOrders(a, database), publishWorkOrders(b, database)])
    expect(results.filter(value => value.outcome === 'conflict')).toHaveLength(1); expect((await database.select().from(auditLog))).toHaveLength(1)
    expect((await readLatestPublication(database))?.publication.publicationId).toBe(a.publicationId)
  })
  it('never replaces newer data with stale concurrent output and records one safe stale rejection', async () => {
    const newer = make(3), older = make(1)
    await Promise.all([publishWorkOrders(newer, database), publishWorkOrders(older, database)])
    expect((await readLatestPublication(database))?.publication.publicationId).toBe(newer.publicationId)
    const oldest = make(0); expect(await publishWorkOrders(oldest, database)).toMatchObject({ outcome: 'stale' })
    expect(await publishWorkOrders(oldest, database)).toMatchObject({ outcome: 'stale', duplicate: true })
    const [row] = await database.select().from(auditLog).where(eq(auditLog.id, oldest.publicationId)); expect(row.detail).not.toHaveProperty('changes')
  })
  it('derives field history, accepts no-change/reorder output and rejects equal-timing conflicting content', async () => {
    const first = make(); await publishWorkOrders(first, database)
    const next = make(2); next.tables.jobs[0].cells[4] = 'Y'; await publishWorkOrders(next, database)
    const [event] = await database.select().from(auditLog).where(eq(auditLog.id, next.publicationId)); expect(event.detail).toMatchObject({ changes: { changed: [{ label: 'Within 3 weeks?', before: 'N', after: 'Y' }] } })
    const noChange = { ...next, publicationId: randomUUID() }; expect(await publishWorkOrders(noChange, database)).toMatchObject({ outcome: 'no_change' })
    const ambiguous = structuredClone(noChange); ambiguous.publicationId = randomUUID(); ambiguous.tables.jobs[0].cells[4] = '?'
    expect(await publishWorkOrders(ambiguous, database)).toMatchObject({ outcome: 'ambiguous' })
    expect((await readLatestPublication(database))?.publication.publicationId).toBe(noChange.publicationId)
  })
  it('rolls back history and latest together when the final snapshot write fails', async () => {
    const first = make(); await publishWorkOrders(first, database)
    const rejected = make(2)
    await fixtureWrite(tx => tx.execute(sql.raw(`ALTER TABLE settings ADD CONSTRAINT fictional_write_failure CHECK (value NOT LIKE '%${rejected.publicationId}%')`)))
    try { await expect(publishWorkOrders(rejected, database)).rejects.toThrow() }
    finally { await fixtureWrite(tx => tx.execute(sql`ALTER TABLE settings DROP CONSTRAINT fictional_write_failure`)) }
    expect((await readLatestPublication(database))?.publication.publicationId).toBe(first.publicationId)
    expect((await database.select().from(auditLog))).toHaveLength(1)
    expect((await database.select().from(settings).where(eq(settings.key, PUBLICATION_SETTING)))).toHaveLength(1)
  })
})
