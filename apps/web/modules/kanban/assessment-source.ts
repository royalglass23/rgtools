import { createHash } from 'node:crypto'
import type { ServiceM8FetchRequest } from '@/lib/servicem8/client'
import { stripEmailNoise } from '@/lib/servicem8/client'
import { sanitizeWorkOrderEnrichmentSource } from '@/modules/work-orders/production-specification-enrichment'
import type { AssessmentContext, AssessmentJob, AssessmentSource, SourceKind, AssessmentCoverage } from './assessment'
import { tokenizeInstallers } from './assessment-installers'
import { settledSourceValues } from './source'

export function assessmentSnapshotHash(job: string | null, item: string) { return createHash('sha256').update(JSON.stringify([job, item])).digest('hex') }
export function assessmentInstallerVersion(installers: Array<{ id: string; name: string }>) { return createHash('sha256').update(JSON.stringify([...installers].sort((a, b) => a.id.localeCompare(b.id)).map(({ id, name }) => [id, name]))).digest('hex') }
export const ASSESSMENT_SOURCE_POLICY = 'kanban-selected-text-v1-20261117'
export const ASSESSMENT_CUSTOM_FIELDS = ['customfield_job_scope_', 'customfield_job_programming', 'customfield_installation_schedule', 'customfield_glass_order', 'customfield_hardware_order', 'customfield_special_order_wo'] as const
export function assessmentContextHash(context: AssessmentContext) {
  // Retrieval time is not authored evidence and must not defeat cache reuse.
  const evidence = { ...context }; delete evidence.fetchedAt
  return createHash('sha256').update(JSON.stringify({ policy: ASSESSMENT_SOURCE_POLICY, evidence })).digest('hex')
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
export class AssessmentContextLimitError extends Error {
  constructor(readonly size: number) { super('Evidence requires a larger-context review; nothing was truncated.') }
}
async function completeRows(request: ServiceM8FetchRequest, path: string) {
  const rows: Record<string, unknown>[] = [], seen = new Set<string>()
  let cursor: string | null = '-1'
  while (cursor) {
    if (seen.size >= 10 || seen.has(cursor)) throw new Error('Evidence pagination did not complete.')
    seen.add(cursor)
    const response = await request(`${path}&cursor=${encodeURIComponent(cursor)}`, { method: 'GET' })
    if (!response.ok) throw new Error('Evidence read failed.')
    const data = await response.json()
    if (!Array.isArray(data) || data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid evidence records.')
    rows.push(...data)
    if (rows.length > 1000) throw new Error('Evidence slice exceeds the review limit.')
    cursor = response.headers?.get('x-next-cursor')?.trim() || null
  }
  return rows.filter(row => row.active !== 0 && row.active !== '0' && row.active !== false)
}
export async function loadAssessmentContext(job: AssessmentJob, request: ServiceM8FetchRequest): Promise<AssessmentContext> {
  if (!job.items.length || job.items.length > 64) throw new Error('Product scope exceeds the assessment limit.')
  const filter = encodeURIComponent(`related_object_uuid eq '${job.sourceId.replaceAll("'", "''")}'`)
  if (!/^[a-zA-Z0-9-]+$/.test(job.sourceId)) throw new Error('Invalid assessment source identity.')
  const [notes, emails, jobResponse] = await settledSourceValues([completeRows(request, `/note.json?$filter=${filter}`), completeRows(request, `/email.json?$filter=${filter}`), request(`/job/${job.sourceId}.json`, { method: 'GET' })])
  if (!jobResponse.ok) throw new Error('Fresh job evidence read failed.')
  const fresh: unknown = await jobResponse.json()
  if (!fresh || typeof fresh !== 'object' || Array.isArray(fresh)) throw new Error('Invalid fresh job evidence.')
  const freshJob = fresh as Record<string, unknown>
  if (freshJob.uuid !== job.sourceId || freshJob.active === false || freshJob.active === 0 || freshJob.active === '0' || (freshJob.status && freshJob.status !== 'Work Order')) throw new Error('Fresh evidence belongs to another job or inactive source.')
  const capturedDescription = (job.description ?? '').trim()
  const descriptionPresent = Object.hasOwn(freshJob, 'job_description')
  if (!descriptionPresent && capturedDescription) throw new Error('Fresh job description is missing; captured text cannot be verified.')
  if (descriptionPresent) {
    const description = freshJob.job_description
    if (description !== null && typeof description !== 'string') throw new Error('Fresh job description is not supported text.')
    if ((description ?? '').trim() !== capturedDescription) throw new Error('The job changed after source reconciliation. Refresh to retry.')
  }
  const installers = job.installers ?? []
  const sanitize = (value: string) => {
    const plain = stripEmailNoise(value)
    if (!plain.trim()) return tokenizeInstallers('', installers)
    const clean = sanitizeWorkOrderEnrichmentSource(plain, { clientNames: [job.customer], jobAddresses: [job.address] })
      .replace(/\bhttps?:\/\/\S+/gi, '[redacted link]').replace(/\b(?:bearer\s+|(?:api[_ -]?key|password|secret)\s*[:=]\s*)[\w./+=-]+/gi, '[redacted secret]')
    return tokenizeInstallers(clean, installers)
  }
  const sources: AssessmentSource[] = []
  function add(kind: SourceKind, value: string, item: string | null, observedAt: string | null, reference: string | null) {
    if (!value.trim()) return
    const clean = sanitize(value)
    if (clean.text.trim()) sources.push({ token: `s${sources.length}`, kind, item, observedAt, reference, text: clean.text, installerTokens: clean.installerTokens })
  }
  add('description', capturedDescription, null, null, null)
  const items = job.items.map((item, index) => ({ token: `p${index}`, text: sanitize(item.description || 'Product source description unavailable').text }))
  job.items.forEach((item, index) => add('item', item.description, `p${index}`, null, null))
  const coverage: AssessmentCoverage = {
    description: { state: capturedDescription ? 'complete' : 'missing', reason: descriptionPresent ? 'Fresh description compared with normalized reconciled text.' : 'Description absent; empty reconciled text has no verified fresh description.' },
    item: { state: job.items.every(item => item.description.trim()) ? 'complete' : 'missing', reason: 'Selected product-description coverage; missing text is not replaced by staff labels.' },
    note: { state: 'complete', reason: 'Bounded active note cursor slice completed.' }, email: { state: 'complete', reason: 'Bounded active email cursor slice completed.' },
    documents: { state: 'unsupported', reason: 'Document/binary content is not interpreted by this text assessment.' },
    photos: { state: 'unsupported', reason: 'Image content is not interpreted.' }, forms: { state: 'unsupported', reason: 'Form content is outside the selected text source contract.' },
  }
  const configuredNote = process.env.SERVICEM8_NOTE_FIELD?.trim()
  const fields: string[] = [...ASSESSMENT_CUSTOM_FIELDS]
  if (configuredNote && /^customfield_[a-zA-Z0-9_]{1,100}$/.test(configuredNote)) fields.push(configuredNote)
  else coverage.configuredNote = { state: 'missing', reason: 'A valid exact custom-field note key is not configured.' }
  for (const field of new Set(fields)) {
    const value = freshJob[field]
    coverage[field] = { state: typeof value === 'string' && value.trim() ? 'complete' : 'missing', reason: value == null || value === '' ? 'Allowlisted custom field is absent or empty.' : typeof value === 'string' ? 'Allowlisted custom-field text read.' : 'Custom-field value is not supported text.' }
    if (typeof value === 'string') add('custom_field', value, null, null, field)
  }
  for (const [kind, rows] of [['note', notes], ['email', emails]] as const) {
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    for (const row of rows) {
      if (row.related_object_uuid && row.related_object_uuid !== job.sourceId) throw new Error('Evidence is attached to another job.')
      const date = (kind === 'email' ? text(row.sent_date) || text(row.date) || text(row.timestamp) || text(row.create_date) : text(row.create_date) || text(row.date) || text(row.timestamp)) || null
      const body = text(row.note) || text(row.message_text) || text(row.body) || text(row.message) || text(row.text) || text(row.message_html) || text(row.html)
      add(kind, kind === 'email' ? [text(row.subject), body].filter(Boolean).join('\n') : body, null, date, text(row.uuid) || null)
    }
  }
  const inventoryVersion = createHash('sha256').update(JSON.stringify([job.id, job.sourceId, job.items.map(({ id, description }) => [id, description])])).digest('hex')
  const context = { items, sources, coverage, installers, inventoryVersion, fetchedAt: new Date().toISOString() }
  const size = JSON.stringify(context).length
  if (size > 160000 || sources.length > 900) throw new AssessmentContextLimitError(size)
  return context
}
