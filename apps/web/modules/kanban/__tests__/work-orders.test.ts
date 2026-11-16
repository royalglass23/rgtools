import { describe, expect, it } from 'vitest'
import { classifyFocus, parseManualState, validateItemSave, withinThreeWeeks } from '../work-orders'

describe('Work Order dashboard product state', () => {
  const today = '2026-11-16'
  it('separates overdue, unknown and the inclusive three-week window', () => {
    expect(classifyFocus(null, 'auto', today)).toBe('unknown')
    expect(classifyFocus('2026-11-15', 'auto', today)).toBe('overdue')
    expect(classifyFocus('2026-11-16', 'auto', today)).toBe('upcoming')
    expect(classifyFocus('2026-12-07', 'auto', today)).toBe('upcoming')
    expect(classifyFocus('2026-12-08', 'auto', today)).toBe('later')
  })
  it('preserves explicit inclusion and exposes date/override disagreement', () => {
    expect(classifyFocus(null, 'include', today)).toBe('included')
    expect(classifyFocus('2026-12-20', 'include', today)).toBe('conflict')
    expect(classifyFocus('2026-11-20', 'exclude', today)).toBe('conflict')
    expect(classifyFocus(null, 'exclude', today)).toBe('excluded')
    expect(classifyFocus('2026-11-20', 'unknown', today)).toBe('unknown')
  })
  it('keeps blank readiness unknown and rejects invented statuses or fields', () => {
    expect(parseManualState({}).siteReady).toBe('unknown')
    expect(() => validateItemSave({ manual: { siteReady: 'ready-ish' } })).toThrow()
    expect(() => validateItemSave({ manual: { isActive: false } })).toThrow()
  })
  it('preserves the added prototype fields and distinguishes not applicable from unknown', () => {
    expect(parseManualState({ bottleStrut: 'yes', buildingConsent: 'na', siteReady: 'na' })).toMatchObject({ bottleStrut: 'yes', buildingConsent: 'na', siteReady: 'na' })
    expect(parseManualState({ notes: 'Existing saved note' })).toMatchObject({ notes: 'Existing saved note', bottleStrut: 'unknown', buildingConsent: 'unknown' })
  })
  it('rolls product inclusion up without labelling unknown or conflicting work as No', () => {
    expect(withinThreeWeeks(['later', 'included'], null, today)).toBe('Y')
    expect(withinThreeWeeks(['later', 'unknown'], null, today)).toBe('?')
    expect(withinThreeWeeks(['upcoming', 'conflict'], null, today)).toBe('Review')
    expect(withinThreeWeeks(['later', 'overdue'], null, today)).toBe('N')
    expect(withinThreeWeeks([], '2026-11-20', today)).toBe('Y')
  })
  it('rejects non-scalar enum values at the save boundary', () => {
    const valid = { id: '40600000-0000-4000-8000-000000000020', revision: 0, installerId: null, installDate: null, expectedInstallerId: null, expectedInstallDate: null }
    for (const manual of [{ siteReady: ['yes'] }, { focus: ['include'] }, { siteReady: { toString: () => 'yes' } }, ['yes']]) {
      expect(() => validateItemSave({ ...valid, manual })).toThrow()
    }
  })
})
