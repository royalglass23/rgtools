import type { AssessmentContext, AssessmentSource, DueResult } from './assessment'
import { supportedEvidenceDates } from './temporal-evidence'
import { validDate } from './work-orders'

export const OPERATIONAL_SCHEMA = 1
export const OPERATIONAL_FIELDS = ['siteReady', 'glassReady', 'hardwareReady', 'designConfirmed', 'ps1Required', 'ps3Required', 'ps1Issued', 'ps3Issued', 'bottleStrut', 'buildingConsent', 'buildingConsentNumber', 'minorVariationRequired', 'clientWaitingFor', 'materialsEta', 'aftercare', 'installerId', 'estimatedHours'] as const
export type OperationalField = typeof OPERATIONAL_FIELDS[number]
export type FieldAssessment = {
  status: 'assessed' | 'unknown' | 'review' | 'unsupported'; value: string | null;
  date: string | null; datePurpose: 'ready' | 'expected' | null; reason: string; evidence: DueResult['evidence'];
  coverage: { complete: string[]; missing: string[]; unsupported: string[] };
}
export type OperationalAssessment = { version: 1; fields: Record<OperationalField, FieldAssessment>; summary: string; gaps: OperationalField[] }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const normalized = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()
const clauses = (text: string) => text.split(/[;\n。；]|[.!](?:\s+|$)/).flatMap(sentence => nonObservation(normalized(sentence)) ? [normalized(sentence)] : sentence.split(/,\s*(?=\p{L})|，|\b(?:and|but|or)\b|但是/iu).map(normalized)).filter(Boolean)
const sourceClauses = (source: string, quote: string) => clauses(source).filter(clause => clause.includes(normalized(quote)) || normalized(quote).includes(clause))
const nonObservation = (text: string) => /[?？]|\b(if|unless|please|could|might|maybe|do not)\b|如果|假如|请|是否|能否/.test(text) || /^(?:is|are|has|have|can|will|would)\b/.test(text) || /\b(?:confirm|check|verify)\b/.test(text)
const declarative = (text: string) => !nonObservation(text) && !/\b(tentative|cancelled|canceled|postponed)\b|取消|推迟|暂定/.test(text)
export const trustworthyAuthoredAt = (source: Pick<AssessmentSource, 'kind' | 'observedAt'>) => source.kind === 'note' || source.kind === 'email' ? source.observedAt : null
const readinessField = (field: OperationalField) => ['siteReady', 'glassReady', 'hardwareReady'].includes(field)
const closedWaitingFor = (text: string) => /\b(?:not|no longer) (?:waiting|awaiting|required|needed|requested)|\b(?:installation|work|variation|request) (?:is |was |has been )?(?:complete|completed|resolved|cancelled|canceled)\b/.test(text)
function typedValue(field: OperationalField, value: string) {
  if (field === 'buildingConsent') return ['approved', 'pending', 'declined'].includes(value)
  if (field === 'buildingConsentNumber') return /^BCO[- ]?\d{5,}$/i.test(value)
  if (field === 'materialsEta') return validDate(value)
  if (field === 'estimatedHours') return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) <= 100000
  if (field === 'installerId' || field === 'clientWaitingFor') return value.trim().length > 0 && value.length <= 500
  return ['yes', 'no', 'na', ...(readinessField(field) ? ['unknown'] : [])].includes(value)
}

function productApplies(clause: string, sourceItem: string | null, claim: Record<string, unknown>, token: string, context: AssessmentContext) {
  if (sourceItem) return sourceItem === token
  if (claim.scope === 'unclear') return false
  if (context.items.length === 1) return true
  if (claim.scope === 'all' && /\b(all products|all items|whole job|entire job)\b|所有产品|全部/.test(clause)) return true
  const cue = typeof claim.productCue === 'string' ? normalized(claim.productCue) : ''
  return cue.length >= 3 && clause.includes(cue) && context.items.filter(item => normalized(item.text).includes(cue)).length === 1 && normalized(context.items.find(item => item.token === token)!.text).includes(cue)
}

function readinessSupports(field: OperationalField, value: string, clause: string) {
  const subject = ({ siteReady: 'site', glassReady: 'glass', hardwareReady: 'hardware' } as Partial<Record<OperationalField, string>>)[field]
  if (!subject) return false
  const chinese = ({ siteReady: '(?:现场|工地)', glassReady: '玻璃', hardwareReady: '五金' } as Record<string, string>)[field]
  if (value === 'yes' && new RegExp(`${chinese}(?:已经|已)(?:到货|到场|收到|准备好|就绪)`).test(clause) && !/损坏|破损|不完整|缺件/.test(clause)) return true
  if (value === 'no' && new RegExp(`${chinese}(?:尚未|还未|未|没有)(?:到货|到场|收到|准备好|就绪)`).test(clause)) return true
  if (value === 'na' && new RegExp(`(?:无需|不需要)${chinese}`).test(clause)) return true
  if (value === 'yes') return new RegExp(`\\b${subject} (?:is |are |has |was )?(?:ready|arrived|received|delivered)\\b`).test(clause) && !/ready (?:to|for) (?:be |the )?(?:measur|order|purchas|manufactur)|\b(damaged|broken|incomplete|missing|defective|expected|eta|due|will|by|scheduled)\b/.test(clause)
  if (value === 'no') return new RegExp(`\\b${subject} (?:is |are |has )?not (?:yet )?(?:ready|arrived|received|delivered)\\b`).test(clause)
  if (value === 'na') return new RegExp(`\\b${subject} (?:is )?(?:not required|not applicable)\\b|\\bno (?:\\w+ ){0,2}${subject} (?:is )?required\\b`).test(clause)
  return value === 'unknown' && new RegExp(`\\b${subject} (?:is |are )?(?:expected|due|eta)\\b`).test(clause)
}

function valueSupports(field: OperationalField, value: string, clause: string, observedAt: string | null, context: AssessmentContext, trustedInstallerTokens: string[] = []) {
  // This field is a narrative of outstanding work, including expectations and
  // questions. The caller verifies the exact source quotes and product scope;
  // a useful summary need not repeat a prescribed phrase or quote verbatim.
  if (field === 'clientWaitingFor') return typedValue(field, value)
    && /\b(?:waiting|awaiting|expects?|expected|requests?|requested|requires?|required|needs?|needed|variation|will)\b|等待|需要|预计/.test(clause)
    && !closedWaitingFor(clause)
  if (!declarative(clause)) return false
  const index = clause.search(fieldSubject[field])
  const prefix = index < 0 ? '' : clause.slice(0, index).split(/\b(?:and|but|or)\b/).at(-1) ?? ''
  if (/\b(?:no|not|without|neither)(?:\s+[\p{L}\p{N}_'-]+){0,3}\s*$/u.test(prefix)) {
    if (value === 'na' && ['siteReady', 'glassReady', 'hardwareReady'].includes(field) && /\bno\b.+\b(?:is )?required\b/.test(clause)) return readinessSupports(field, value, clause)
    return false
  }
  if (['siteReady', 'glassReady', 'hardwareReady'].includes(field)) return readinessSupports(field, value, clause)
  if (/^ps[13](?:Required|Issued)$/.test(field)) {
    const document = field.startsWith('ps1') ? 'ps1' : 'ps3'
    if (field.endsWith('Required')) {
      if (value === 'yes' && new RegExp(`(?<!不|无)需要\\s*${document}|${document}(?:已)?(?:需要|必须)`).test(clause)) return true
      if (value === 'no' && new RegExp(`(?:不需要|无需)\\s*${document}|${document}(?:不需要|无需)`).test(clause)) return true
    } else {
      if (value === 'yes' && new RegExp(`${document}(?:已经|已)(?:签发|出具|发出)`).test(clause)) return true
      if (value === 'no' && new RegExp(`${document}(?:尚未|未|没有)(?:签发|出具|发出)`).test(clause)) return true
    }
  }
  const definitions: Partial<Record<OperationalField, [string, string, string]>> = {
    designConfirmed: ['design', 'confirmed|approved|finalised|finalized', 'not confirmed|not approved'],
    ps1Required: ['ps1', 'required|needed', 'not required|not needed'], ps3Required: ['ps3', 'required|needed', 'not required|not needed'],
    ps1Issued: ['ps1', 'issued|sent|provided', 'not (?:been )?issued|not sent|not provided'], ps3Issued: ['ps3', 'issued|sent|provided', 'not (?:been )?issued|not sent|not provided'],
    bottleStrut: ['bottle strut', 'required|included|installed', 'not required|not included'],
    minorVariationRequired: ['minor variation', 'required|needed', 'not required|not needed'], aftercare: ['aftercare', 'required|requested|needed', 'not required|not needed'],
  }
  const definition = definitions[field]
  if (definition) {
    const [subject, positive, negative] = definition
    if (value === 'na') return new RegExp(`\\b${subject} (?:is )?not applicable\\b`).test(clause)
    const expression = value === 'yes' ? positive : value === 'no' ? negative : null
    return Boolean(expression && new RegExp(`\\b${subject} (?:is |was |has |has been )?(?:${expression})\\b`).test(clause) && !/\b(will|would|planned)\b/.test(clause))
  }
  if (field === 'buildingConsent') {
    const status = ({ approved: 'approved|granted|issued', pending: 'pending|awaiting approval', declined: 'declined|refused|rejected' } as Record<string, string>)[value]
    return Boolean(status && new RegExp(`\\b(?:building consent|bc) (?:is |was )?(?:${status})\\b`).test(clause))
  }
  if (field === 'buildingConsentNumber') return /^BCO[- ]?\d{5,}$/i.test(value) && clause.includes(normalized(value))
  if (field === 'materialsEta') return validDate(value) && /\b(materials?|glass|hardware)\b/.test(clause) && /\b(eta|expected|due)\b/.test(clause) && supportedEvidenceDates(clause, observedAt).includes(value)
  if (field === 'installerId') {
    const installer = context.installers?.find(installer => installer.token === value)
    if (!installer || (!trustedInstallerTokens.includes(installer.token) && context.installers!.filter(other => normalized(other.name) === normalized(installer.name)).length !== 1)) return false
    const escapedName = normalized(installer.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const alias = trustedInstallerTokens.includes(installer.token) ? `(?:${escapedName}|${installer.token})` : escapedName
    return new RegExp(`\\b(?:installer|installation team) (?:is |assigned: |: ?)?${alias}(?:\\b|$)`).test(clause) || new RegExp(`${alias} (?:is )?assigned (?:to install|as installer)\\b`).test(clause)
  }
  if (field === 'estimatedHours') {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value) > 100000) return false
    const match = clause.match(/\b(?:estimated? (?:labou?r|installation|install)(?: time)?|labou?r estimate)\s*(?:is |:|=)?\s*(\d+(?:\.\d{1,2})?)\s*(?:hours?|hrs?|h)\b/)
    return Boolean(match && Number(match[1]) === Number(value))
  }
  return false
}

export function evidenceOrder(timestamp: string | null): string | null {
  if (!timestamp) return null
  if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(timestamp)) return timestamp.length === 10 ? timestamp + 'T00:00:00' : timestamp.replace(' ', 'T').padEnd(19, '0')
  const instant = new Date(timestamp)
  if (!Number.isFinite(instant.getTime()) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '00'
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`
}

function canSupersede(timestamp: string | null, matches: Array<{ observedAt: string | null }>) {
  const baseline = matches.map(source => evidenceOrder(source.observedAt)).filter((value): value is string => Boolean(value)).sort().at(-1)
  const order = evidenceOrder(timestamp)
  return !order || !baseline || (timestamp?.length === 10 && order.slice(0, 10) === baseline.slice(0, 10)) || order >= baseline
}

export function planningEvidenceNeedsReview(claim: Record<string, unknown>, context: AssessmentContext) {
  const token = String(claim.item)
  const purpose = claim.kind === 'installation' ? /\b(?:install(?:ation)?|fit(?:ting)?)\b|安装/ : /\b(?:deliver(?:y|ed)?|supply)\b|送货|交货|交付/
  const refs = Array.isArray(claim.evidence) ? claim.evidence : []
  const matches = refs.flatMap(ref => {
    if (!object(ref) || typeof ref.quote !== 'string') return []
    const source = context.sources.find(source => source.token === ref.source)
    return source ? sourceClauses(source.text, ref.quote).filter(clause => declarative(clause) && productApplies(clause, source.item, claim, token, context) && purpose.test(clause) && supportedEvidenceDates(clause, trustworthyAuthoredAt(source)).includes(String(claim.date))).map(clause => ({ clause, observedAt: trustworthyAuthoredAt(source) })) : []
  })
  if (!matches.length) return true
  return context.sources.some(source => canSupersede(trustworthyAuthoredAt(source), matches) && clauses(source.text).some(clause => {
    if (!productApplies(clause, source.item, claim, token, context) || !purpose.test(clause)) return false
    if (!declarative(clause) || /\b(?:not confirmed|on hold)\b/.test(clause)) return true
    return supportedEvidenceDates(clause, trustworthyAuthoredAt(source)).some(date => date !== claim.date)
  }))
}

const fieldSubject: Record<OperationalField, RegExp> = {
  siteReady: /\bsite\b|现场|工地/, glassReady: /\bglass\b|玻璃/, hardwareReady: /\bhardware\b|五金/, designConfirmed: /\bdesign\b|设计/,
  ps1Required: /\bps1\b/, ps3Required: /\bps3\b/, ps1Issued: /\bps1\b/, ps3Issued: /\bps3\b/,
  bottleStrut: /\bbottle strut\b/, buildingConsent: /\b(?:building consent|bc)\b/, buildingConsentNumber: /\bbco[- ]?\d+\b/,
  minorVariationRequired: /\bminor variation\b/, clientWaitingFor: /\b(?:waiting|awaiting|installation|install|variation|request)\b/, materialsEta: /\b(?:materials?|glass|hardware)\b/,
  aftercare: /\baftercare\b/, installerId: /\b(?:installer|installation team|assigned)\b/, estimatedHours: /\b(?:estimate|estimated)\b/,
}
function superseded(field: OperationalField, claim: Record<string, unknown>, token: string, matching: Array<{ observedAt: string | null }>, context: AssessmentContext) {
  return context.sources.some(source => {
    if (!canSupersede(trustworthyAuthoredAt(source), matching)) return false
    return clauses(source.text).some(clause => {
      if (!productApplies(clause, source.item, claim, token, context) || !fieldSubject[field].test(clause) || nonObservation(clause)) return false
      if (field === 'clientWaitingFor' && closedWaitingFor(clause)) return true
      const sameMeaning = ['ps1Issued', 'ps3Issued'].includes(field) ? /\b(issued|issuance|sent|provided)\b|签发|出具|发出/.test(clause)
        : ['ps1Required', 'ps3Required', 'minorVariationRequired'].includes(field) ? /\b(required|needed|requirement)\b|需要|要求|必须/.test(clause)
        : field === 'buildingConsent' ? /\b(approved|approval|granted|issued|pending|declined|refused|rejected)\b/.test(clause) : true
      if (sameMeaning && /\b(cancelled|canceled|postponed|tentative|no longer|not confirmed)\b|取消|推迟|暂定|不再|未确认/.test(clause) && !valueSupports(field, String(claim.value), clause, trustworthyAuthoredAt(source), context, source.installerTokens)) return true
      const candidates = field === 'installerId' ? context.installers?.map(installer => installer.token) ?? []
        : field === 'materialsEta' ? supportedEvidenceDates(clause, trustworthyAuthoredAt(source))
        : field === 'buildingConsentNumber' ? clause.match(/\bbco[- ]?\d{5,}\b/g) ?? []
        : field === 'estimatedHours' ? [clause.match(/(\d+(?:\.\d{1,2})?)\s*(?:hours?|hrs?|h)\b/)?.[1] ?? '']
        : field === 'clientWaitingFor' ? [clause.match(/\b(?:waiting for|awaiting)\s+(.+)$/)?.[1] ?? '']
        : ['yes', 'no', 'na', 'unknown', 'approved', 'pending', 'declined']
      return candidates.some(value => normalized(value) !== normalized(String(claim.value)) && valueSupports(field, value, clause, trustworthyAuthoredAt(source), context, source.installerTokens))
    })
  })
}

function fieldCoverage(field: OperationalField, context: AssessmentContext): FieldAssessment['coverage'] {
  const extra = ['ps1Required', 'ps3Required', 'ps1Issued', 'ps3Issued', 'designConfirmed', 'buildingConsent', 'buildingConsentNumber', 'minorVariationRequired'].includes(field) ? ['documents']
    : ['siteReady', 'glassReady', 'hardwareReady', 'aftercare'].includes(field) ? ['photos', 'forms'] : []
  const result: FieldAssessment['coverage'] = { complete: [], missing: [], unsupported: [] }
  for (const [kind, source] of Object.entries(context.coverage ?? {})) {
    if (['documents', 'photos', 'forms'].includes(kind) && !extra.includes(kind)) continue
    result[source.state].push(kind)
  }
  return result
}

export function validateOperationalAssessmentOutput(raw: unknown, context: AssessmentContext): OperationalAssessment[] {
  if (!object(raw) || !Array.isArray(raw.results) || raw.results.length !== context.items.length) throw new Error('Incomplete operational assessment output.')
  const results = new Map<string, OperationalAssessment>()
  for (const row of raw.results) {
    if (!object(row) || typeof row.item !== 'string' || !context.items.some(item => item.token === row.item) || results.has(row.item) || !object(row.fields) || Object.keys(row.fields).length !== OPERATIONAL_FIELDS.length || OPERATIONAL_FIELDS.some(field => !Object.hasOwn(row.fields as object, field))) throw new Error('Incomplete operational product/field output.')
    const fields = {} as Record<OperationalField, FieldAssessment>
    for (const field of OPERATIONAL_FIELDS) {
      const claim = row.fields[field]
      if (!object(claim) || !['assessed', 'unknown', 'review', 'unsupported'].includes(String(claim.status)) || typeof claim.status !== 'string' || typeof claim.reason !== 'string' || claim.reason.length > 600 || !Array.isArray(claim.evidence) || claim.evidence.length > 3) throw new Error('Malformed operational field output.')
      const result: FieldAssessment = { status: claim.status as FieldAssessment['status'], value: null, date: null, datePurpose: null, reason: claim.reason, evidence: [], coverage: fieldCoverage(field, context) }
      let valid = (claim.value === null || (typeof claim.value === 'string' && claim.value.length <= 500)) && (claim.date === null || typeof claim.date === 'string') && ['product', 'all', 'unclear'].includes(String(claim.scope)) && typeof claim.scope === 'string' && (claim.productCue === null || typeof claim.productCue === 'string') && (claim.datePurpose === null || claim.datePurpose === 'ready' || claim.datePurpose === 'expected')
      for (const ref of claim.evidence) {
        if (!object(ref) || typeof ref.source !== 'string' || typeof ref.quote !== 'string' || ref.quote.trim().length < 5 || ref.quote.length > 1000) { valid = false; continue }
        const source = context.sources.find(source => source.token === ref.source)
        if (!source || !normalized(source.text).includes(normalized(ref.quote)) || (source.item && source.item !== row.item)) { valid = false; continue }
        result.evidence.push({ kind: source.kind, reference: source.reference, observedAt: trustworthyAuthoredAt(source), quote: ref.quote.trim() })
      }
      if (claim.status === 'assessed') {
        const matching = claim.evidence.flatMap(ref => {
          if (!object(ref) || typeof ref.source !== 'string' || typeof ref.quote !== 'string') return []
          const source = context.sources.find(source => source.token === ref.source)
          return source ? sourceClauses(source.text, ref.quote).filter(clause => productApplies(clause, source.item, claim, row.item as string, context) && typeof claim.value === 'string' && valueSupports(field, claim.value, clause, trustworthyAuthoredAt(source), context, source.installerTokens)).map(clause => ({ clause, observedAt: trustworthyAuthoredAt(source) })) : []
        })
        const noDate = claim.date === null && claim.datePurpose === null
        const dateValid = claim.value !== 'na' && validDate(claim.date) && ['ready', 'expected'].includes(String(claim.datePurpose)) && matching.some(({ clause, observedAt }) => supportedEvidenceDates(clause, observedAt).includes(claim.date as string) && (claim.datePurpose === 'expected' ? /\b(expected|due|eta)\b/.test(clause) : claim.value === 'yes' && !/\b(expected|due|eta)\b/.test(clause)))
        if (valid && result.evidence.length && matching.length && (noDate || dateValid) && !superseded(field, claim, row.item, matching, context)) {
          result.status = 'assessed'; result.value = field === 'installerId' ? context.installers!.find(installer => installer.token === claim.value)!.id : claim.value as string
          if (dateValid) { result.date = claim.date as string; result.datePurpose = claim.datePurpose as 'ready' | 'expected' }
        } else { result.status = 'review'; result.reason = 'The proposed value is not established by supported field evidence.' }
      } else if (!valid) { result.status = 'review'; result.reason = 'The proposed evidence could not be validated.' }
      if (result.status === 'unknown' && result.coverage.unsupported.length) { result.status = 'unsupported'; result.reason = 'No supported value was found; additional document/photo/form content is not covered.' }
      fields[field] = result
    }
    const gaps = OPERATIONAL_FIELDS.filter(field => fields[field].status !== 'assessed')
    results.set(row.item, { version: OPERATIONAL_SCHEMA, fields, summary: `${OPERATIONAL_FIELDS.length - gaps.length} operational fields established; ${gaps.length} need evidence or review.`, gaps })
  }
  return context.items.map(item => results.get(item.token)!)
}

export function readOperationalAssessment(raw: unknown): OperationalAssessment | null {
  if (!object(raw) || raw.version !== OPERATIONAL_SCHEMA || !object(raw.fields) || Object.keys(raw.fields).length !== OPERATIONAL_FIELDS.length || typeof raw.summary !== 'string' || raw.summary.length > 1000 || !Array.isArray(raw.gaps) || raw.gaps.length > OPERATIONAL_FIELDS.length || raw.gaps.some(field => !OPERATIONAL_FIELDS.includes(field))) return null
  for (const field of OPERATIONAL_FIELDS) {
    const value = raw.fields[field]
    if (!object(value) || !['assessed', 'unknown', 'review', 'unsupported'].includes(String(value.status)) || typeof value.status !== 'string' || (value.value !== null && (typeof value.value !== 'string' || value.value.length > 500)) || typeof value.reason !== 'string' || value.reason.length > 600 || !Array.isArray(value.evidence) || value.evidence.length > 3 || !object(value.coverage) || ['complete', 'missing', 'unsupported'].some(kind => !Array.isArray((value.coverage as Record<string, unknown>)[kind]) || ((value.coverage as Record<string, unknown>)[kind] as unknown[]).some(kind => typeof kind !== 'string'))) return null
    if (value.date !== null && !validDate(value.date)) return null
    if (value.datePurpose !== null && value.datePurpose !== 'ready' && value.datePurpose !== 'expected') return null
    if (Boolean(value.date) !== Boolean(value.datePurpose)) return null
    if (value.status !== 'assessed' && (value.value !== null || value.date !== null)) return null
    if (value.status === 'assessed' && (!value.evidence.length || typeof value.value !== 'string')) return null
    if (value.status === 'assessed' && !typedValue(field, value.value as string)) return null
    if (value.date !== null && !readinessField(field)) return null
    if (value.evidence.some(source => !object(source) || !['description', 'item', 'note', 'email', 'custom_field'].includes(String(source.kind)) || typeof source.kind !== 'string' || typeof source.quote !== 'string')) return null
  }
  return raw as OperationalAssessment
}
