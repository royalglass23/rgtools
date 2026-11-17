import { describe, expect, it } from 'vitest'
import { applyFieldPatches, automaticDashboardState, readFieldOwnership } from '../field-ownership'
import { validateFieldPatches } from '../work-orders'

describe('Kanban field ownership compatibility', () => {
  it('protects actually stored legacy blank/unknown choices and ambiguous canonical clears', () => {
    const ownership = readFieldOwnership({ siteReady: 'unknown', notes: '', materialsEta: null })
    expect(ownership.siteReady).toBe('staff')
    expect(ownership.notes).toBe('staff')
    expect(ownership.materialsEta).toBe('staff')
    expect(ownership.glassReady).toBe('auto')
    expect(ownership.installDate).toBe('staff')
    expect(ownership.installerId).toBe('staff')
    expect(readFieldOwnership(automaticDashboardState()).installDate).toBe('auto')
  })
  it('pins an explicit same-value Unknown without claiming other fields and releases only that override', () => {
    const selected = applyFieldPatches(automaticDashboardState(), { installDate: null, installerId: null }, { siteReady: { mode: 'staff', value: 'unknown' } })
    expect(readFieldOwnership(selected.dashboardState)).toMatchObject({ siteReady: 'staff', glassReady: 'auto', installDate: 'auto' })
    const reset = applyFieldPatches(selected.dashboardState, selected, { siteReady: { mode: 'auto' } })
    expect(readFieldOwnership(reset.dashboardState).siteReady).toBe('auto')
    expect(readFieldOwnership(reset.dashboardState).notes).toBe('auto')
  })
  it('rejects malformed saved ownership rather than interpreting it as permission to use AI', () => {
    const saved = automaticDashboardState() as { _ownership: { version: number; fields: Record<string, unknown> } }
    saved._ownership.fields.installDate = ['auto']
    expect(() => readFieldOwnership(saved)).toThrow('Unsupported field ownership')
  })
  it('requires an explicit readiness state for a dated staff value and releases its date together', () => {
    expect(() => validateFieldPatches({ siteReady: { mode: 'staff', value: { date: '2026-11-20', datePurpose: 'expected' } } })).toThrow('Invalid readiness')
    const saved = applyFieldPatches(automaticDashboardState(), { installDate: null, installerId: null }, { siteReady: { mode: 'staff', value: { state: 'no', date: '2026-11-20', datePurpose: 'expected' } } })
    expect(saved.dashboardState).toMatchObject({ siteReady: 'no', _readinessDates: { siteReady: { date: '2026-11-20', datePurpose: 'expected' } } })
    const reset = applyFieldPatches(saved.dashboardState, saved, { siteReady: { mode: 'auto' } })
    expect(reset.dashboardState._readinessDates).toBeUndefined()
    expect(readFieldOwnership(reset.dashboardState).siteReady).toBe('auto')
  })
})
