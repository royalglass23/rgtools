export const KANBAN_FLAGS_SETTING = 'kanban.master-flags.v1'
export type KanbanFlag = 'Y' | 'N' | '?'
export type FlagSource = { spreadsheetId: string; sheetId: number; sheet: 'Master'; modifiedAt: string; retrievedAt: string; ranges: string[] }
export type FlagManifest = { version: 1; source: FlagSource; rows: Array<{ row: number; jobNumber: string; flag: KanbanFlag; cell: string }> }
export type ImportedKanbanFlag = { jobId: string; jobNumber: string; jobUuid: string; flag: KanbanFlag; sourceCell: string; source: FlagSource; sourceHash: string; importedAt: string }
export type ImportedFlagState = { version: 1; entries: Record<string, ImportedKanbanFlag> }
export type FlagInventoryJob = { id: string; jobNumber: string | null; jobUuid: string | null; products: number; overrides: number }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const flag = (value: unknown): value is KanbanFlag => value === 'Y' || value === 'N' || value === '?'
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
const jobNumber = (value: unknown): value is string => typeof value === 'string' && /^[A-Z][A-Z0-9]{2,24}$/.test(value)
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
function validSource(value: unknown): value is FlagSource {
  return object(value) && typeof value.spreadsheetId === 'string' && /^[\w-]{20,200}$/.test(value.spreadsheetId) &&
    Number.isSafeInteger(value.sheetId) && Number(value.sheetId) >= 0 && value.sheet === 'Master' && timestamp(value.modifiedAt) && timestamp(value.retrievedAt) &&
    Array.isArray(value.ranges) && value.ranges.length > 0 && value.ranges.length <= 8 && value.ranges.every(range => typeof range === 'string' && /^[A-Z]+\d+:[A-Z]+\d+$/.test(range))
}
export function parseFlagManifest(raw: unknown): FlagManifest {
  if (!object(raw) || raw.version !== 1 || !validSource(raw.source) || !Array.isArray(raw.rows) || !raw.rows.length || raw.rows.length > 1000) throw new Error('Invalid Kanban flag manifest.')
  const seen = new Set<string>()
  for (const row of raw.rows) {
    if (!object(row) || !jobNumber(row.jobNumber) || !flag(row.flag) || !Number.isSafeInteger(row.row) || Number(row.row) < 2 || Number(row.row) > 1000 || row.cell !== `AR${row.row}`) throw new Error('Invalid Kanban flag row.')
    if (seen.has(row.jobNumber)) throw new Error('Duplicate job number in Kanban flag source.')
    seen.add(row.jobNumber)
  }
  return raw as FlagManifest
}
export function planFlagImport(manifest: FlagManifest, inventory: FlagInventoryJob[]) {
  const unmatched: string[] = [], ambiguous: string[] = []
  const matched: Array<{ jobId: string; jobUuid: string; jobNumber: string; flag: KanbanFlag; products: number; overrides: number; sourceCell: string }> = []
  for (const row of manifest.rows) {
    const jobs = inventory.filter(job => job.jobNumber?.trim().toUpperCase() === row.jobNumber)
    if (!jobs.length || (jobs.length === 1 && !jobs[0].jobUuid)) { unmatched.push(row.jobNumber); continue }
    if (jobs.length > 1) { ambiguous.push(row.jobNumber); continue }
    const job = jobs[0]
    matched.push({ jobId: job.id, jobUuid: job.jobUuid!, jobNumber: row.jobNumber, flag: row.flag, products: job.products, overrides: job.overrides, sourceCell: row.cell })
  }
  return { matched, unmatched, ambiguous }
}
export function readImportedFlags(value?: string): ImportedFlagState {
  if (!value) return { version: 1, entries: {} }
  if (value.length > 2_000_000) throw new Error('Kanban flag setting exceeds its bounded limit.')
  const raw: unknown = JSON.parse(value)
  if (!object(raw) || raw.version !== 1 || !object(raw.entries) || Object.keys(raw.entries).length > 10000) throw new Error('Invalid saved Kanban flags.')
  for (const [id, entry] of Object.entries(raw.entries)) {
    if (!uuid.test(id) || !object(entry) || entry.jobId !== id || !jobNumber(entry.jobNumber) || typeof entry.jobUuid !== 'string' || !entry.jobUuid || !flag(entry.flag) ||
      typeof entry.sourceCell !== 'string' || !/^AR\d+$/.test(entry.sourceCell) || !validSource(entry.source) || typeof entry.sourceHash !== 'string' || !entry.sourceHash || !timestamp(entry.importedAt)) throw new Error('Invalid saved Kanban flag entry.')
  }
  return raw as ImportedFlagState
}
export function importedFlagForJob(state: ImportedFlagState, job: { id: string; jobNumber: string | null; jobUuid: string | null }): ImportedKanbanFlag | null {
  const entry = state.entries[job.id]
  return entry && entry.jobUuid === job.jobUuid && entry.jobNumber === job.jobNumber?.trim().toUpperCase() ? entry : null
}
