import { READINESS_FIELDS, parseManualState, validateFieldPatches, type FieldPatches, type ManualState, type ReadinessDetail } from './work-orders'

export const OWNED_FIELDS = [...Object.keys(READINESS_FIELDS), 'clientWaitingFor', 'materialsEta', 'estimatedHours', 'notes', 'focus', 'installDate', 'installerId'] as const
export type OwnedField = keyof ManualState | 'installDate' | 'installerId'
export type FieldMode = 'auto' | 'staff'
export type FieldOwnership = Record<OwnedField, FieldMode>
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))

export function automaticDashboardState(): Record<string, unknown> {
  return { _ownership: { version: 1, fields: Object.fromEntries(OWNED_FIELDS.map(field => [field, 'auto'])) } }
}

// Stored legacy defaults may be deliberate clears. Only keys actually present
// are protected; canonical nulls without provenance are conservatively staff-owned.
export function readFieldOwnership(raw: unknown): FieldOwnership {
  const state = object(raw) ? raw : {}
  const metadata = state._ownership
  if (metadata !== undefined) {
    if (!object(metadata) || metadata.version !== 1 || !object(metadata.fields) || OWNED_FIELDS.some(field => {
      const mode = (metadata.fields as Record<string, unknown>)[field]
      return mode !== 'auto' && mode !== 'staff'
    })) {
      throw new Error('Unsupported field ownership. Ask an administrator to review this product.')
    }
    return Object.fromEntries(OWNED_FIELDS.map(field => [field, (metadata.fields as Record<string, unknown>)[field]])) as FieldOwnership
  }
  return Object.fromEntries(OWNED_FIELDS.map(field => [field, field === 'installDate' || field === 'installerId' || Object.hasOwn(state, field) ? 'staff' : 'auto'])) as FieldOwnership
}

export function applyFieldPatches(raw: unknown, canonical: { installDate: string | null; installerId: string | null }, rawPatches: FieldPatches) {
  const patches = validateFieldPatches(rawPatches)
  const state = object(raw) ? raw : {}
  const ownership = readFieldOwnership(raw)
  const dashboardState = { ...state }
  const dates = object(state._readinessDates) ? { ...state._readinessDates } : {}
  const result = { installDate: canonical.installDate, installerId: canonical.installerId }
  const defaults = parseManualState({})
  for (const field of Object.keys(patches) as OwnedField[]) {
    const patch = patches[field]!
    ownership[field] = patch.mode
    if (field === 'installerId' || field === 'installDate') {
      result[field] = patch.mode === 'auto' ? null : patch.value as string | null
    } else {
      const value = patch.mode === 'auto' ? defaults[field] : patch.value
      if (object(value)) {
        dashboardState[field] = value.state
        dates[field] = { date: value.date, datePurpose: value.datePurpose }
      } else {
        dashboardState[field] = value
        delete dates[field]
      }
    }
  }
  dashboardState._ownership = { version: 1, fields: ownership }
  if (Object.keys(dates).length) dashboardState._readinessDates = dates
  else delete dashboardState._readinessDates
  return { ...result, dashboardState }
}

export type ReadinessDates = Partial<Record<keyof typeof READINESS_FIELDS, Omit<ReadinessDetail, 'state'>>>
