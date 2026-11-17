import { classifyFocus, validDate, type ManualState } from './work-orders'
import { supportedEvidenceDates } from './temporal-evidence'
import type { KanbanFlag } from './kanban-flags'
import { planningEvidenceNeedsReview, readOperationalAssessment, trustworthyAuthoredAt, type OperationalAssessment } from './operational-assessment'

export const ASSESSMENT_RULES = 'kanban-operational-v3-20261118'
export type SourceKind = 'description' | 'item' | 'note' | 'email' | 'custom_field'
export type AssessmentCoverage = Record<string, { state: 'complete' | 'missing' | 'unsupported'; reason: string }>
export type AssessmentInstaller = { token: string; name: string; id: string }
export type AssessmentSource = { token: string; kind: SourceKind; item: string | null; observedAt: string | null; text: string; reference: string | null; installerTokens?: string[] }
export type AssessmentContext = { items: Array<{ token: string; text: string }>; sources: AssessmentSource[]; coverage?: AssessmentCoverage; installers?: AssessmentInstaller[]; fetchedAt?: string; inventoryVersion?: string }
export type ProviderContext = { items: AssessmentContext['items']; sources: Array<Omit<AssessmentSource, 'reference'>>; coverage?: AssessmentCoverage; installers?: Array<Pick<AssessmentInstaller, 'token'>> }
export type DueResult = {
  status: 'dated' | 'review' | 'unknown'; date: string | null; kind: 'installation' | 'delivery' | 'unknown'; reason: string;
  evidence: Array<{ kind: SourceKind; reference: string | null; observedAt: string | null; quote: string }>
}
export type StoredAssessment = {
  state: 'complete' | 'failed'; sourceHash: string; snapshotHash: string; rules: string; model: string;
  checkedAt: string; assessedAt: string | null; result: DueResult | null; error: string | null;
  operational?: OperationalAssessment; coverage?: AssessmentCoverage; sourceGeneration?: string | null;
  installerVersion?: string; sourcePolicy?: string;
}
export type AssessmentJob = { id: string; sourceId: string; customer: string; address: string | null; description: string | null;
  claim?: import('./assessment-runs').AssessmentClaim; assessmentReused?: boolean;
  sourceGeneration?: string | null; installers?: AssessmentInstaller[];
  items: Array<{ id: string; label: string; description: string; stored: StoredAssessment | null }> }
export type AssessmentStore = {
  list(): Promise<AssessmentJob[]>;
  save(job: AssessmentJob, values: Record<string, StoredAssessment>, actorId: string): Promise<boolean>;
  fail(job: AssessmentJob, checkedAt: string, actorId: string, message?: string): Promise<void>;
}
const normalized = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))

// Treat model output as an untrusted proposal, never as a manual-field patch.
export function validateAssessmentOutput(raw: unknown, context: AssessmentContext): DueResult[] {
  if (!object(raw) || !Array.isArray(raw.results) || raw.results.length !== context.items.length) throw new Error('Incomplete assessment output.')
  const byItem = new Map<string, DueResult>()
  for (const value of raw.results) {
    if (!object(value) || typeof value.item !== 'string' || !context.items.some(item => item.token === value.item) || byItem.has(value.item)) throw new Error('Unknown or duplicate product in assessment.')
    if (!['dated', 'review', 'unknown'].includes(String(value.status)) || typeof value.status !== 'string' || !['installation', 'delivery', 'unknown'].includes(String(value.kind)) || typeof value.kind !== 'string') throw new Error('Invalid assessment state.')
    if (value.date !== null && (!validDate(value.date) || value.date < '2000-01-01' || value.date > '2100-12-31')) throw new Error('Invalid assessed date.')
    if (typeof value.reason !== 'string' || value.reason.length > 600 || !Array.isArray(value.evidence) || value.evidence.length > 3 || !['product', 'all', 'unclear'].includes(String(value.scope)) || typeof value.scope !== 'string') throw new Error('Invalid assessment evidence.')
    const evidence = value.evidence.map(ref => {
      if (!object(ref) || typeof ref.source !== 'string' || typeof ref.quote !== 'string' || ref.quote.trim().length < 5 || ref.quote.length > 1000) throw new Error('Invalid source reference.')
      const source = context.sources.find(source => source.token === ref.source)
      if (!source || !normalized(source.text).includes(normalized(ref.quote))) throw new Error('Assessment quote is absent from source.')
      if (source.item && source.item !== value.item) throw new Error('Evidence belongs to another product.')
      return { kind: source.kind, reference: source.reference, observedAt: trustworthyAuthoredAt(source), quote: ref.quote.trim() }
    })
    if (value.status === 'dated' && (!value.date || value.kind === 'unknown' || !evidence.length)) throw new Error('A dated assessment requires supporting evidence.')
    let status = value.status as DueResult['status']
    let reason = value.reason.trim()
    if (status === 'dated') {
      const quote = normalized(evidence.map(ref => ref.quote).join(' '))
      const cue = typeof value.productCue === 'string' ? normalized(value.productCue) : ''
      const uniqueCue = cue.length >= 3 && quote.includes(cue) && context.items.filter(item => normalized(item.text).includes(cue)).length === 1 && normalized(context.items.find(item => item.token === value.item)!.text).includes(cue)
      const itemSource = value.evidence.some(ref => object(ref) && context.sources.some(source => source.token === ref.source && source.item === value.item))
      const allProducts = value.scope === 'all' && /\b(all products|all items|whole job|entire job)\b|所有产品|全部安装/.test(quote)
      if (context.items.length > 1 && !itemSource && !uniqueCue && !allProducts) { status = 'review'; reason = 'Product scope is unclear. ' + reason }
      if (!/\b(install(?:ation)?|fit(?:ting)?|deliver(?:y|ed)?|supply)\b|安装|送货|交货|交付/.test(quote) || /scheduled_until|internal booking|site visit scheduled|task due|\b(cancelled|canceled|postponed|tentative|not confirmed)\b/.test(quote)) {
        status = 'review'; reason = 'Installation or delivery intent needs review. ' + reason
      }
      if (!evidence.some(source => supportedEvidenceDates(source.quote, source.observedAt).includes(value.date as string))) {
        status = 'review'; reason = 'The proposed date cannot be resolved from supported source wording and its timestamp. ' + reason
      }
      if (planningEvidenceNeedsReview(value, context)) { status = 'review'; reason = 'Current product-specific installation/delivery evidence needs review. ' + reason }
    }
    byItem.set(value.item, { status, date: value.date as string | null, kind: value.kind as DueResult['kind'], reason: reason.slice(0, 600), evidence })
  }
  return context.items.map(item => byItem.get(item.token)!)
}

export function readStoredAssessment(raw: unknown): StoredAssessment | null {
  if (!object(raw) || !['complete', 'failed'].includes(String(raw.state)) || typeof raw.sourceHash !== 'string' || typeof raw.snapshotHash !== 'string' || typeof raw.rules !== 'string' || typeof raw.model !== 'string' || typeof raw.checkedAt !== 'string') return null
  const result = raw.result
  if (raw.state === 'complete' && !object(result)) return null
  if (result !== null && (!object(result) || !['dated', 'review', 'unknown'].includes(String(result.status)) || (result.date !== null && !validDate(result.date)) || !['installation', 'delivery', 'unknown'].includes(String(result.kind)) || typeof result.reason !== 'string' || !Array.isArray(result.evidence) || result.evidence.some(ref => !object(ref) || !['description', 'item', 'note', 'email', 'custom_field'].includes(String(ref.kind)) || typeof ref.quote !== 'string') || (result.status === 'dated' && (!result.date || result.kind === 'unknown' || !result.evidence.length)))) return null
  if (raw.operational !== undefined && !readOperationalAssessment(raw.operational)) return null
  return raw as StoredAssessment
}

export function resolveProductPlanning(date: string | null, manual: ManualState, assessment: StoredAssessment | null, sourceCurrent: boolean, today: string, inheritedFlag: KanbanFlag | null = null, dateMode: 'auto' | 'staff' = 'auto') {
  const usable = sourceCurrent && assessment?.state === 'complete' && assessment.rules === ASSESSMENT_RULES
  const detectedDate = usable && assessment.result?.status === 'dated' ? assessment.result.date : null
  const planningDate = dateMode === 'staff' ? date : date ?? detectedDate
  const choice = manual.focus !== 'auto' ? manual.focus : inheritedFlag === 'Y' ? 'include' : inheritedFlag === 'N' ? 'exclude' : inheritedFlag === '?' ? 'unknown' : 'auto'
  const focus = dateMode === 'auto' && !date && choice === 'auto' && usable && assessment.result?.status === 'review'
    ? 'conflict' as const : classifyFocus(planningDate, choice, today)
  // Bot rule: the team's explicit Y/N/? wins; an explicit Y can retain overdue work.
  const inDueWindow = choice === 'include' || (choice === 'auto' && focus === 'upcoming')
  return { planningDate, detectedDate, focus, inDueWindow, dateSource: date || dateMode === 'staff' ? 'staff' as const : detectedDate ? 'detected' as const : 'unknown' as const }
}

export function assessmentIsCurrent(assessment: StoredAssessment | null, snapshotHash: string, syncedAt: Date | null) {
  return Boolean(assessment && assessment.rules === ASSESSMENT_RULES && assessment.snapshotHash === snapshotHash &&
    (!syncedAt || Date.parse(assessment.checkedAt) >= syncedAt.getTime()))
}
