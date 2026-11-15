export const READINESS_FIELDS = {
  siteReady: 'Site ready', glassReady: 'Glass ready', hardwareReady: 'Hardware ready',
  designConfirmed: 'Design confirmed', ps1Required: 'PS1 needed', ps3Required: 'PS3 needed',
  minorVariationRequired: 'Minor variation needed', aftercare: 'Aftercare',
  ps1Issued: 'PS1 issued', ps3Issued: 'PS3 issued',
} as const
export type Readiness = 'unknown' | 'yes' | 'no'
export type ManualState = Record<keyof typeof READINESS_FIELDS, Readiness> & {
  clientWaitingFor: string; materialsEta: string | null; estimatedHours: string;
  notes: string; focus: 'auto' | 'include' | 'exclude' | 'unknown';
}
export type Focus = 'upcoming' | 'overdue' | 'unknown' | 'later' | 'included' | 'excluded' | 'conflict'
export const FOCUS_LABELS: Record<Focus, string> = {
  upcoming: 'Within 3 weeks', overdue: 'Overdue', unknown: 'Date / inclusion unknown',
  later: 'Later', included: 'Included manually', excluded: 'Excluded manually', conflict: 'Date / override conflict',
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
    if (typeof v !== 'string' || !['unknown', 'yes', 'no'].includes(v)) throw new Error('Readiness must be Yes, No or Unknown.')
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
export type ItemSave = {
  id: string; revision: number; expectedInstallerId: string | null; expectedInstallDate: string | null;
  installerId: string | null; installDate: string | null; manual: ManualState;
}
export function validateItemSave(raw: unknown): ItemSave {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid product update.')
  const d = raw as Record<string, unknown>
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (typeof d.id !== 'string' || !uuid.test(d.id) || !Number.isSafeInteger(d.revision) || Number(d.revision) < 0) throw new Error('Invalid product revision.')
  for (const key of ['installerId', 'expectedInstallerId']) if (d[key] !== null && (typeof d[key] !== 'string' || !uuid.test(d[key] as string))) throw new Error('Invalid installer.')
  for (const key of ['installDate', 'expectedInstallDate']) if (d[key] !== null && !validDate(d[key])) throw new Error('Invalid install date.')
  return { id: d.id, revision: Number(d.revision), expectedInstallerId: d.expectedInstallerId as string | null, expectedInstallDate: d.expectedInstallDate as string | null,
    installerId: d.installerId as string | null, installDate: d.installDate as string | null, manual: parseManualState(d.manual, true) }
}
