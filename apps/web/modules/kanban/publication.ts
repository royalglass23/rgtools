import { createHash } from 'node:crypto'
import { TABLE_A_SOURCE_HEADERS, TABLE_B_SOURCE_HEADERS } from './published-output'

export const MAX_PUBLICATION_BYTES = 4 * 1024 * 1024
export const PUBLICATION_ENTITY = 'kanban.work-orders.publication'
export const PUBLICATION_SETTING = 'kanban.work-orders.latest.v1'
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export type DirectRow = { id: string; cells: string[] }
export type DirectTables = { jobs: DirectRow[]; products: DirectRow[] }
export type Publication = { schemaVersion: 1; board: 'work-orders'; publicationId: string; requestId?: string; complete: true; sourceAsOf: string; generatedAt: string; tables: DirectTables }
export type RowChange = { table: keyof DirectTables; id: string; cells: string[] }
export type FieldChange = { table: keyof DirectTables; id: string; column: number; label: string; before: string; after: string }
export type PublicationChanges = { added: RowChange[]; removed: RowChange[]; changed: FieldChange[] }
export type PublicationResult = { outcome: 'published' | 'no_change' | 'stale' | 'ambiguous'; publicationId: string; duplicate: boolean }
export type PublicationEvent = { version: 1; publisher: 'kanban-bot'; hash: string; publicationId: string; requestId?: string; sourceAsOf: string; generatedAt: string; receivedAt: string; outcome: PublicationResult['outcome']; initial: boolean; tableCounts: { jobs: number; products: number }; changes?: PublicationChanges; counts: { added: number; removed: number; changed: number } }
export type StoredPublication = { version: 1; publication: Publication; receivedAt: string; hash: string }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid publication object.')
  return value as Record<string, unknown>
}
function exact(value: Record<string, unknown>, keys: string[], optional: string[] = []) {
  if (keys.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !keys.includes(key) && !optional.includes(key))) throw new Error('Invalid publication fields.')
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Publication timestamps must be valid UTC ISO timestamps with milliseconds.')
  return value
}
function databaseText(value: string): boolean {
  // JSONB cannot store NUL or unpaired UTF-16 surrogates. Preserve all valid text verbatim.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code === 0 || (code >= 0xdc00 && code <= 0xdfff)) return false
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
    }
  }
  return true
}
export function parsePublication(raw: unknown, now = new Date()): Publication {
  const value = object(raw)
  exact(value, ['schemaVersion', 'board', 'publicationId', 'complete', 'sourceAsOf', 'generatedAt', 'tables'], ['requestId'])
  if (value.schemaVersion !== 1 || value.board !== 'work-orders' || value.complete !== true || typeof value.publicationId !== 'string' || !UUID.test(value.publicationId) ||
      (value.requestId !== undefined && (typeof value.requestId !== 'string' || !UUID.test(value.requestId)))) throw new Error('Invalid complete Work Orders publication.')
  const sourceAsOf = timestamp(value.sourceAsOf), generatedAt = timestamp(value.generatedAt)
  if (sourceAsOf > generatedAt || Date.parse(generatedAt) > now.getTime() + 5 * 60_000) throw new Error('Invalid publication timing.')
  const tables = object(value.tables); exact(tables, ['jobs', 'products'])
  const read = (key: keyof DirectTables, width: number): DirectRow[] => {
    const rows = tables[key]
    if (!Array.isArray(rows) || rows.length > 5000) throw new Error('Invalid publication row count.')
    const ids = new Set<string>()
    return rows.map(rawRow => {
      const row = object(rawRow); exact(row, ['id', 'cells'])
      if (typeof row.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(row.id) || ids.has(row.id)) throw new Error('Rows require unique stable source IDs.')
      if (!Array.isArray(row.cells) || row.cells.length !== width || row.cells.some(cell => typeof cell !== 'string' || cell.length > 16000 || !databaseText(cell))) throw new Error('Invalid publication cells.')
      ids.add(row.id)
      return { id: row.id, cells: [...row.cells] as string[] }
    })
  }
  return { schemaVersion: 1, board: 'work-orders', publicationId: value.publicationId.toLowerCase(), ...(value.requestId ? { requestId: (value.requestId as string).toLowerCase() } : {}), complete: true,
    sourceAsOf, generatedAt, tables: { jobs: read('jobs', 5), products: read('products', 11) } }
}
export function deliveryHash(value: Publication): string {
  const sort = (rows: DirectRow[]) => rows.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return createHash('sha256').update(JSON.stringify({ ...value, tables: { jobs: sort(value.tables.jobs), products: sort(value.tables.products) } })).digest('hex')
}
export function changesBetween(before: DirectTables | null, after: DirectTables): PublicationChanges {
  const changes: PublicationChanges = { added: [], removed: [], changed: [] }
  for (const table of ['jobs', 'products'] as const) {
    const prior = new Map((before?.[table] ?? []).map(row => [row.id, row])), next = new Map(after[table].map(row => [row.id, row]))
    const headers = table === 'jobs' ? TABLE_A_SOURCE_HEADERS : TABLE_B_SOURCE_HEADERS
    for (const row of after[table]) {
      const old = prior.get(row.id)
      if (!old) changes.added.push({ table, ...row })
      else row.cells.forEach((cell, column) => { if (cell !== old.cells[column]) changes.changed.push({ table, id: row.id, column, label: headers[column], before: old.cells[column], after: cell }) })
    }
    for (const row of before?.[table] ?? []) if (!next.has(row.id)) changes.removed.push({ table, ...row })
  }
  return changes
}
