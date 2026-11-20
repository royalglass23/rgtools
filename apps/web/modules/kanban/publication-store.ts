import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auditLog, settings } from '@rgtools/db/schema'
import { changesBetween, deliveryHash, PUBLICATION_ENTITY, PUBLICATION_SETTING, type Publication, type PublicationEvent, type PublicationResult, type StoredPublication } from './publication'

type Database = Pick<typeof db, 'transaction' | 'select'>
const actions = ['kanban.publication.accepted', 'kanban.publication.rejected']
function stored(raw: string | undefined): StoredPublication | null {
  if (!raw) return null
  const parsed = JSON.parse(raw) as StoredPublication | null
  if (parsed === null) return null
  if (parsed.version !== 1 || !parsed.publication?.tables || typeof parsed.hash !== 'string') throw new Error('Stored Kanban publication is invalid.')
  return parsed
}
export async function publishWorkOrders(publication: Publication, database: Database = db, now = new Date()): Promise<PublicationResult | { outcome: 'conflict'; publicationId: string; duplicate: false }> {
  const hash = deliveryHash(publication)
  return database.transaction(async tx => {
    await tx.insert(settings).values({ key: PUBLICATION_SETTING, value: 'null' }).onConflictDoNothing({ target: settings.key })
    const [row] = await tx.select().from(settings).where(eq(settings.key, PUBLICATION_SETTING)).for('update')
    const [existing] = await tx.select().from(auditLog).where(eq(auditLog.id, publication.publicationId))
    if (existing) {
      const detail = existing.detail as PublicationEvent | null
      if (existing.entityType !== PUBLICATION_ENTITY || !actions.includes(existing.action) || detail?.hash !== hash) return { outcome: 'conflict', publicationId: publication.publicationId, duplicate: false }
      return { outcome: detail.outcome, publicationId: publication.publicationId, duplicate: true }
    }
    const previous = stored(row.value)
    const changes = changesBetween(previous?.publication.tables ?? null, publication.tables)
    const counts = { added: changes.added.length, removed: changes.removed.length, changed: changes.changed.length }
    const changed = counts.added + counts.removed + counts.changed > 0
    const prior = previous?.publication
    let outcome: PublicationResult['outcome'] = !previous || changed ? 'published' : 'no_change'
    if (prior && (publication.sourceAsOf < prior.sourceAsOf || (publication.sourceAsOf === prior.sourceAsOf && publication.generatedAt < prior.generatedAt))) outcome = 'stale'
    else if (prior && publication.sourceAsOf === prior.sourceAsOf && publication.generatedAt === prior.generatedAt && changed) outcome = 'ambiguous'
    const accepted = outcome === 'published' || outcome === 'no_change'
    const receivedAt = now.toISOString()
    const detail: PublicationEvent = { version: 1, publisher: 'kanban-bot', hash, publicationId: publication.publicationId, ...(publication.requestId ? { requestId: publication.requestId } : {}), sourceAsOf: publication.sourceAsOf,
      generatedAt: publication.generatedAt, receivedAt, outcome, initial: !previous, tableCounts: { jobs: publication.tables.jobs.length, products: publication.tables.products.length }, counts: accepted ? counts : { added: 0, removed: 0, changed: 0 }, ...(accepted ? { changes } : {}) }
    await tx.insert(auditLog).values({ id: publication.publicationId, actorId: null, targetId: null, entityType: PUBLICATION_ENTITY, action: accepted ? actions[0] : actions[1], detail, createdAt: now })
    if (accepted) await tx.update(settings).set({ value: JSON.stringify({ version: 1, publication, receivedAt, hash } satisfies StoredPublication), updatedAt: now, updatedBy: null }).where(eq(settings.id, row.id))
    return { outcome, publicationId: publication.publicationId, duplicate: false }
  })
}
export async function readLatestPublication(database: Database = db): Promise<StoredPublication | null> {
  const [row] = await database.select({ value: settings.value }).from(settings).where(eq(settings.key, PUBLICATION_SETTING))
  return stored(row?.value)
}
export async function readPublicationVersion(database: Database = db): Promise<string | null> {
  const [row] = await database.select({ id: sql<string | null>`(${settings.value}::jsonb)->'publication'->>'publicationId'` }).from(settings).where(eq(settings.key, PUBLICATION_SETTING))
  return row?.id ?? null
}
export type PublicationSummary = { id: string; receivedAt: string; sourceAsOf: string; generatedAt: string; outcome: PublicationEvent['outcome']; initial: boolean; tableCounts: PublicationEvent['tableCounts']; counts: PublicationEvent['counts'] }
export async function readPublicationHistory(page: number, database: Database = db): Promise<{ events: PublicationSummary[]; hasNext: boolean }> {
  // Archived audit rows retain publisher identity and remain part of delivery history/deduplication.
  const rows = await database.select({ id: auditLog.id, detail: sql<Omit<PublicationEvent, 'changes'>>`${auditLog.detail} - 'changes'` }).from(auditLog)
    .where(and(eq(auditLog.entityType, PUBLICATION_ENTITY), inArray(auditLog.action, actions))).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(21).offset((Math.max(1, Math.min(1000, page)) - 1) * 20)
  return { events: rows.slice(0, 20).map(({ id, detail }) => ({ id, receivedAt: detail.receivedAt, sourceAsOf: detail.sourceAsOf, generatedAt: detail.generatedAt, outcome: detail.outcome, initial: detail.initial, tableCounts: detail.tableCounts, counts: detail.counts })), hasNext: rows.length > 20 }
}
export async function readPublicationChanges(id: string, database: Database = db) {
  const [row] = await database.select({ detail: auditLog.detail }).from(auditLog).where(and(eq(auditLog.id, id), eq(auditLog.entityType, PUBLICATION_ENTITY), inArray(auditLog.action, actions)))
  return row ? row.detail as PublicationEvent : null
}
