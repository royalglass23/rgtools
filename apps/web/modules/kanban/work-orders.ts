export const READINESS_FIELDS = {
  siteReady: 'Site ready', glassReady: 'Glass ready', hardwareReady: 'Hardware ready',
  designConfirmed: 'Design confirmed', ps1Required: 'PS1 needed', ps3Required: 'PS3 needed',
  minorVariationRequired: 'Minor variation needed', aftercare: 'Aftercare',
  ps1Issued: 'PS1 issued', ps3Issued: 'PS3 issued',
  bottleStrut: 'Bottle strut', buildingConsent: 'BC?',
} as const
export type Readiness = 'unknown' | 'yes' | 'no' | 'na'
export const READINESS_LABELS: Record<Readiness, string> = { unknown: '?', yes: 'Y', no: 'N', na: 'N/A' }
export const DASHBOARD_PAGE_SIZES = [5, 10, 20, 50] as const
export function dashboardPageSize(value: string) { return DASHBOARD_PAGE_SIZES.find(size => String(size) === value) ?? 5 }
export type ManualState = Record<keyof typeof READINESS_FIELDS, Readiness> & {
  clientWaitingFor: string; materialsEta: string | null; estimatedHours: string;
  notes: string; focus: 'auto' | 'include' | 'exclude' | 'unknown';
}
export type Focus = 'upcoming' | 'overdue' | 'unknown' | 'later' | 'included' | 'excluded' | 'conflict'
export const FOCUS_LABELS: Record<Focus, string> = {
  upcoming: 'Within 3 weeks', overdue: 'Overdue', unknown: 'Date / inclusion unknown',
  later: 'Later', included: 'Included manually', excluded: 'Excluded manually', conflict: 'Date / override conflict',
}
export function withinThreeWeeks(focuses: Focus[], jobDate: string | null, today = aucklandToday()) {
  const states = focuses.length ? focuses : [classifyFocus(jobDate, 'auto', today)]
  if (states.includes('conflict')) return 'Review'
  if (states.some(state => state === 'upcoming' || state === 'included')) return 'Y'
  return states.includes('unknown') ? '?' : 'N'
}
export function aucklandToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-')
}
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function classifyFocus(date: string | null, override: ManualState['focus'], today = aucklandToday()): Focus {
  const end = new Date(today + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 21)
  const inWindow = Boolean(date && date >= today && date <= end.toISOString().slice(0, 10))
  if (override === 'unknown') return 'unknown'
  if (override === 'exclude') return inWindow ? 'conflict' : 'excluded'
  if (override === 'include') return date && !inWindow ? 'conflict' : 'included'
  if (!date) return 'unknown'
  return date < today ? 'overdue' : inWindow ? 'upcoming' : 'later'
}
export function parseManualState(raw: unknown, strict = false): ManualState {
  if (strict && (!raw || typeof raw !== 'object' || Array.isArray(raw))) throw new Error('Manual fields must be an object.')
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const result = { clientWaitingFor: '', materialsEta: null, estimatedHours: '', notes: '', focus: 'auto' } as ManualState
  const allowed = [...Object.keys(READINESS_FIELDS), ...Object.keys(result)]
  if (strict && Object.keys(data).some(key => !allowed.includes(key))) throw new Error('Unsupported manual field.')
  for (const key of Object.keys(READINESS_FIELDS) as Array<keyof typeof READINESS_FIELDS>) {
    const v = data[key] ?? 'unknown'
    if (typeof v !== 'string' || !['unknown', 'yes', 'no', 'na'].includes(v)) throw new Error('Readiness must be Yes, No, Unknown or N/A.')
    result[key] = v as Readiness
  }
  for (const key of ['clientWaitingFor', 'estimatedHours', 'notes'] as const) {
    if (data[key] != null && typeof data[key] !== 'string') throw new Error('Invalid manual text.')
    result[key] = String(data[key] ?? '').trim()
    if (result[key].length > (key === 'notes' ? 4000 : 500)) throw new Error('Manual text is too long.')
  }
  if (result.estimatedHours && (!/^\d+(\.\d{1,2})?$/.test(result.estimatedHours) || Number(result.estimatedHours) > 100000)) throw new Error('Enter non-negative hours, up to two decimal places.')
  if (data.materialsEta && !validDate(data.materialsEta)) throw new Error('Materials ETA must be a valid date.')
  result.materialsEta = data.materialsEta ? String(data.materialsEta) : null
  if (data.focus != null && (typeof data.focus !== 'string' || !['auto', 'include', 'exclude', 'unknown'].includes(data.focus))) throw new Error('Invalid focus selection.')
  result.focus = (data.focus ?? 'auto') as ManualState['focus']
  return result
}
export type OwnedField = keyof ManualState | 'installDate' | 'installerId'
export type ReadinessDetail = { state: Readiness; date: string | null; datePurpose: 'ready' | 'expected' | null }
type FieldValues = ManualState & { installDate: string | null; installerId: string | null }
export type FieldPatches = Partial<{ [K in OwnedField]: { mode: 'auto' } | { mode: 'staff'; value: FieldValues[K] | (K extends keyof typeof READINESS_FIELDS ? ReadinessDetail : never) } }>
export type ItemSave = {
  id: string; revision: number; expectedInstallerId: string | null; expectedInstallDate: string | null;
  patches: FieldPatches;
}
export function validateItemSave(raw: unknown): ItemSave {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid product update.')
  const d = raw as Record<string, unknown>
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (typeof d.id !== 'string' || !uuid.test(d.id) || !Number.isSafeInteger(d.revision) || Number(d.revision) < 0) throw new Error('Invalid product revision.')
  if (Object.keys(d).some(key => !['id', 'revision', 'expectedInstallerId', 'expectedInstallDate', 'patches'].includes(key))) throw new Error('Unsupported product update. Reload before saving.')
  if (d.expectedInstallerId !== null && (typeof d.expectedInstallerId !== 'string' || !uuid.test(d.expectedInstallerId))) throw new Error('Invalid installer.')
  if (d.expectedInstallDate !== null && !validDate(d.expectedInstallDate)) throw new Error('Invalid install date.')
  return { id: d.id, revision: Number(d.revision), expectedInstallerId: d.expectedInstallerId as string | null, expectedInstallDate: d.expectedInstallDate as string | null,
    patches: validateFieldPatches(d.patches) }
}

export function validateFieldPatches(raw: unknown): FieldPatches {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length) throw new Error('Choose at least one field to update.')
  const defaults = parseManualState({})
  const patches: Record<string, unknown> = {}
  for (const [key, rawPatch] of Object.entries(raw)) {
    if (![...Object.keys(defaults), 'installDate', 'installerId'].includes(key) || !rawPatch || typeof rawPatch !== 'object' || Array.isArray(rawPatch)) throw new Error('Unsupported field update.')
    const patch = rawPatch as Record<string, unknown>
    if (patch.mode === 'auto' && Object.keys(patch).length === 1) { patches[key] = { mode: 'auto' }; continue }
    if (patch.mode !== 'staff' || Object.keys(patch).some(key => !['mode', 'value'].includes(key)) || !Object.hasOwn(patch, 'value')) throw new Error('Invalid field ownership update.')
    let value = patch.value
    if (key === 'installDate') {
      if (value !== null && !validDate(value)) throw new Error('Invalid install date.')
    } else if (key === 'installerId') {
      if (value !== null && (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) throw new Error('Invalid installer.')
    } else if (Object.hasOwn(READINESS_FIELDS, key) && value && typeof value === 'object' && !Array.isArray(value)) {
      const detail = value as Record<string, unknown>
      if (typeof detail.state !== 'string' || Object.keys(detail).some(key => !['state', 'date', 'datePurpose'].includes(key)) || (detail.date !== null && !validDate(detail.date)) || (detail.datePurpose !== null && detail.datePurpose !== 'ready' && detail.datePurpose !== 'expected') || Boolean(detail.date) !== Boolean(detail.datePurpose)) throw new Error('Invalid readiness date.')
      value = { state: parseManualState({ [key]: detail.state }, true)[key as keyof ManualState], date: detail.date, datePurpose: detail.datePurpose }
    } else {
      if (value === undefined || (Object.hasOwn(READINESS_FIELDS, key) && value === null)) throw new Error('Invalid field value.')
      value = parseManualState({ [key]: value }, true)[key as keyof ManualState]
    }
    patches[key] = { mode: 'staff', value }
  }
  return patches as FieldPatches
}
