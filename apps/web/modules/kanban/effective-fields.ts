import type { DashboardProduct } from './persistence'
import type { FieldAssessment, OperationalField } from './operational-assessment'
import type { DueResult } from './assessment'
import { readFieldOwnership, type ReadinessDates } from './field-ownership'
import { READINESS_FIELDS, parseManualState, validDate, type ManualState, type OwnedField, type Readiness } from './work-orders'

export type EffectiveField = {
  value: string | null; origin: 'Auto' | 'Staff' | 'Staff / legacy'; status: 'staff' | 'assessed' | 'unknown' | 'review' | 'unsupported' | 'pending' | 'stale' | 'failed';
  date: string | null; datePurpose: 'ready' | 'expected' | null; reason: string;
  evidence: DueResult['evidence']; assessedAt: string | null; coverage: FieldAssessment['coverage'];
  planningPurpose?: 'installation' | 'delivery' | null;
}
export type EffectiveFields = Record<OwnedField | 'buildingConsentNumber', EffectiveField>
const readiness = (value: string | null): value is Readiness => value !== null && ['yes', 'no', 'na', 'unknown'].includes(value)
export const FIELD_LABELS = { ...READINESS_FIELDS, installerId: 'Installer', installDate: 'Planning date', buildingConsentNumber: 'Consent reference', clientWaitingFor: 'Client waiting for', materialsEta: 'Materials ETA', estimatedHours: 'Estimated hours', notes: 'Staff Notes', focus: 'Focus selection' }
export function coverageLabel(key: string) {
  return ({ description: 'Job description', item: 'Product description', note: 'Notes', email: 'Emails', documents: 'Documents', photos: 'Photos', forms: 'Forms', configuredNote: 'Configured job note', customfield_job_scope_: 'Job scope', customfield_job_programming: 'Job programming', customfield_installation_schedule: 'Installation schedule', customfield_glass_order: 'Glass order', customfield_hardware_order: 'Hardware order', customfield_special_order_wo: 'Special order' } as Record<string, string>)[key] ?? 'Additional job evidence'
}
export function readManualReadinessDates(raw: unknown): ReadinessDates {
  const dates: ReadinessDates = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return dates
  const data = (raw as Record<string, unknown>)._readinessDates
  if (!data || typeof data !== 'object' || Array.isArray(data)) return dates
  for (const key of ['siteReady', 'glassReady', 'hardwareReady'] as const) {
    const value = (data as Record<string, unknown>)[key]
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const detail = value as Record<string, unknown>
    if (validDate(detail.date) && (detail.datePurpose === 'ready' || detail.datePurpose === 'expected')) dates[key] = { date: detail.date, datePurpose: detail.datePurpose }
  }
  return dates
}
// Display composition only. No automatic result is copied into staff storage.
export function effectiveProductFields(product: DashboardProduct) {
  const ownership = product.ownership ?? readFieldOwnership(product.manual)
  const defaults = parseManualState({}), fields = {} as EffectiveFields
  const manual: ManualState = { ...defaults, notes: product.manual.notes, focus: product.manual.focus }
  const readinessDates: ReadinessDates = {}
  const assessment = product.assessment
  const auto = (raw: FieldAssessment | undefined, current: boolean): EffectiveField => {
    const status = !assessment ? 'pending' : assessment.state === 'failed' ? 'failed' : !current ? 'stale' : raw?.status ?? 'unknown'
    return { value: status === 'assessed' ? raw?.value ?? null : null, origin: 'Auto', status, date: status === 'assessed' ? raw?.date ?? null : null, datePurpose: status === 'assessed' ? raw?.datePurpose ?? null : null,
      reason: raw?.reason ?? assessment?.error ?? 'No current supported automatic value.', evidence: raw?.evidence ?? [], assessedAt: assessment?.assessedAt ?? null,
      coverage: raw?.coverage ?? { complete: [], missing: ['Current field evidence'], unsupported: [] } }
  }
  for (const key of [...Object.keys(defaults), 'installDate', 'installerId', 'buildingConsentNumber'] as Array<keyof EffectiveFields>) {
    if (key !== 'buildingConsentNumber' && (ownership[key] === 'staff' || key === 'notes' || key === 'focus')) {
      const value = key === 'installerId' ? product.installerId : key === 'installDate' ? product.installDate : product.manual[key]
      const detail = product.readinessDates?.[key as keyof ReadinessDates]
      fields[key] = { value, origin: product.legacyOwnership && ownership[key] === 'staff' ? 'Staff / legacy' : 'Staff', status: 'staff', date: detail?.date ?? null, datePurpose: detail?.datePurpose ?? null,
        reason: key === 'notes' ? 'Staff Notes are separate from generated assessment notes.' : 'Staff value, including deliberate blanks and Unknown, is protected until explicitly released.', evidence: [], assessedAt: null, coverage: { complete: [], missing: [], unsupported: [] } }
    } else if (key === 'installDate') {
      const date = assessment?.result
      const raw: FieldAssessment | undefined = date ? { status: date.status === 'dated' ? 'assessed' : date.status, value: date.date, date: null, datePurpose: null, reason: date.reason, evidence: date.evidence, coverage: { complete: [], missing: [], unsupported: [] } } : undefined
      fields[key] = { ...auto(raw, product.assessmentCurrent), planningPurpose: date?.kind === 'installation' || date?.kind === 'delivery' ? date.kind : null }
    } else {
      fields[key] = auto(assessment?.operational?.fields[key as OperationalField], Boolean(product.operationalCurrent))
    }
    const field = fields[key]
    if (Object.hasOwn(READINESS_FIELDS, key)) {
      // Automatic BC statuses are literal approved/pending/declined. They have
      // no defined conversion into the existing staff Y/N/?/N/A choice.
      manual[key as keyof typeof READINESS_FIELDS] = readiness(field.value) ? field.value : 'unknown'
      if (field.date && field.datePurpose) readinessDates[key as keyof ReadinessDates] = { date: field.date, datePurpose: field.datePurpose }
    } else if (key === 'materialsEta') manual.materialsEta = field.value || null
    else if (key === 'estimatedHours' || key === 'clientWaitingFor') manual[key] = field.value ?? ''
  }
  return { fields, manual, readinessDates, summary: product.operationalCurrent && assessment?.state === 'complete' ? assessment.operational?.summary ?? null : null,
    gaps: product.operationalCurrent && assessment?.state === 'complete' ? assessment.operational?.gaps ?? [] : [] }
}
