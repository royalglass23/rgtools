import { createHash } from 'node:crypto'
import type { ServiceM8FetchRequest } from '@/lib/servicem8/client'
import { stripEmailNoise } from '@/lib/servicem8/client'
import { sanitizeWorkOrderEnrichmentSource } from '@/modules/work-orders/production-specification-enrichment'
import type { AssessmentContext, AssessmentJob, AssessmentSource, SourceKind } from './assessment'

export function assessmentSnapshotHash(job: string | null, item: string) { return createHash('sha256').update(JSON.stringify([job, item])).digest('hex') }
export function assessmentContextHash(context: AssessmentContext) { return createHash('sha256').update(JSON.stringify(context)).digest('hex') }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
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
  const [notes, emails] = await Promise.all([completeRows(request, `/note.json?$filter=${filter}`), completeRows(request, `/email.json?$filter=${filter}`)])
  const sanitize = (value: string) => {
    const plain = stripEmailNoise(value)
    if (!plain.trim()) return ''
    return sanitizeWorkOrderEnrichmentSource(plain, { clientNames: [job.customer], jobAddresses: [job.address] })
      .replace(/\bhttps?:\/\/\S+/gi, '[redacted link]').replace(/\b(?:bearer\s+|(?:api[_ -]?key|password|secret)\s*[:=]\s*)[\w./+=-]+/gi, '[redacted secret]')
  }
  const sources: AssessmentSource[] = []
  function add(kind: SourceKind, value: string, item: string | null, observedAt: string | null, reference: string | null) {
    if (!value.trim()) return
    const clean = sanitize(value)
    if (clean.trim()) sources.push({ token: `s${sources.length}`, kind, item, observedAt, reference, text: clean })
  }
  add('description', job.description ?? '', null, null, null)
  const items = job.items.map((item, index) => ({ token: `p${index}`, text: sanitize(item.description || item.label) }))
  job.items.forEach((item, index) => add('item', item.description, `p${index}`, null, null))
  for (const [kind, rows] of [['note', notes], ['email', emails]] as const) {
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    for (const row of rows) {
      if (row.related_object_uuid && row.related_object_uuid !== job.sourceId) throw new Error('Evidence is attached to another job.')
      const date = text(row.create_date) || text(row.sent_date) || text(row.date) || text(row.timestamp) || null
      const body = text(row.note) || text(row.message_text) || text(row.body) || text(row.message) || text(row.text) || text(row.message_html) || text(row.html)
      add(kind, kind === 'email' ? [text(row.subject), body].filter(Boolean).join('\n') : body, null, date, text(row.uuid) || null)
    }
  }
  const context = { items, sources }
  if (JSON.stringify(context).length > 60000) throw new Error('Evidence requires a larger-context review; nothing was truncated.')
  return context
}
