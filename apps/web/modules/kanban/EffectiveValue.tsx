import { coverageLabel, type EffectiveField } from './effective-fields'
import styles from './WorkOrderDashboard.module.css'
import { validDate } from './work-orders'

export const displayDate = (value: string | null) => value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : 'Unknown'
const time = (value: string) => new Date(value).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })
function authoredTime(kind: string, value: string | null) {
  if ((kind !== 'note' && kind !== 'email') || !value) return 'Authored time unknown'
  const raw = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && validDate(raw)) return `Authored: ${displayDate(raw)} (date only; Auckland)`
  const local = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (local && validDate(local[1]) && Number(local[2]) < 24 && Number(local[3]) < 60 && (!local[4] || Number(local[4]) < 60)) {
    return `Authored: ${displayDate(local[1])}, ${raw.slice(11)} (Auckland source time)`
  }
  // Only an explicit offset permits instant conversion. A timezone-less
  // ServiceM8 wall clock must never acquire the viewer's browser timezone.
  if (validDate(raw.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) && Number.isFinite(Date.parse(raw.replace(' ', 'T')))) return `Authored: ${time(raw.replace(' ', 'T'))} (Auckland)`
  return 'Authored time unknown'
}
const states = { staff: 'Protected', assessed: 'Supported', unknown: 'Unknown', review: 'Review / conflict', unsupported: 'Unsupported coverage', pending: 'Pending', stale: 'Stale', failed: 'Failed' }
export function EffectiveValue({ field, label, kind, installers = [] }: { field: EffectiveField; label: string; kind?: 'date' | 'installer' | 'hours'; installers?: Array<{ id: string; name: string }> }) {
  const value = field.value === null || field.value === '' ? field.origin.startsWith('Staff') ? 'Blank / Unknown' : 'Unknown' : kind === 'date' ? displayDate(field.value) : kind === 'installer' ? installers.find(installer => installer.id === field.value)?.name ?? 'Configured installer' : kind === 'hours' ? `${field.value} h` : ({ yes: 'Y', no: 'N', na: 'N/A', unknown: 'Unknown' } as Record<string, string>)[field.value] ?? field.value
  return <div className={styles.effective}>
    <span>{value}{kind === 'installer' && field.origin === 'Auto' && field.value ? ' · suggestion only' : ''}{field.origin === 'Auto' && field.planningPurpose ? ` · ${field.planningPurpose}` : ''}</span>
    {field.date && <div className={styles.source}>{field.datePurpose === 'ready' ? 'Ready on' : 'Expected'}: {displayDate(field.date)}</div>}
    <details className={styles.fieldEvidence}>
      <summary aria-label={`Evidence for ${label}`}>Details</summary>
      <p>{field.origin} · {states[field.status]}</p>
      <p>{field.reason}</p>
      {field.assessedAt && <p>Assessed: {time(field.assessedAt)} (Auckland)</p>}
      {field.evidence.length ? field.evidence.map((evidence, index) => <blockquote key={index}>
        <strong>{evidence.kind}</strong><p>{authoredTime(evidence.kind, evidence.observedAt)}</p><p>{evidence.quote}</p>
      </blockquote>) : <p>{field.origin.startsWith('Staff') ? 'Staff changes are recorded in Change history.' : 'No supporting quote is available.'}</p>}
      {field.origin === 'Auto' && <p>Coverage: {field.coverage.complete.length ? `complete ${field.coverage.complete.map(coverageLabel).join(', ')}` : 'no complete field evidence'}{field.coverage.missing.length ? `; missing ${field.coverage.missing.map(coverageLabel).join(', ')}` : ''}{field.coverage.unsupported.length ? `; unsupported ${field.coverage.unsupported.map(coverageLabel).join(', ')}` : ''}.</p>}
    </details>
  </div>
}
