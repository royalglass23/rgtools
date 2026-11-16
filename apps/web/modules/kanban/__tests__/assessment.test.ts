import { describe, expect, it } from 'vitest'
import { ASSESSMENT_RULES, assessmentIsCurrent, resolveProductPlanning, validateAssessmentOutput, type AssessmentContext, type StoredAssessment } from '../assessment'
import { parseManualState } from '../work-orders'
const context: AssessmentContext = { items: [{ token: 'p0', text: 'Shower ensuite' }, { token: 'p1', text: 'Balustrade deck' }], sources: [
  { token: 's0', kind: 'note', item: null, reference: 'note-1', observedAt: '2026-11-16 10:00:00', text: 'Install shower on 20/11/2026.' },
] }
const output = (quote = 'Install shower on 20/11/2026.') => ({ results: [
  { item: 'p0', status: 'dated', date: '2026-11-20', kind: 'installation', scope: 'product', productCue: 'shower', reason: 'Explicit installation date.', evidence: [{ source: 's0', quote }] },
  { item: 'p1', status: 'unknown', date: null, kind: 'unknown', scope: 'unclear', productCue: null, reason: 'No date.', evidence: [] },
] })
const stored = (): StoredAssessment => ({ state: 'complete', sourceHash: 'hash', snapshotHash: 'snapshot', rules: ASSESSMENT_RULES, model: 'fixture', checkedAt: '2026-11-16T00:00:00Z', assessedAt: '2026-11-16T00:00:00Z', error: null,
  result: { status: 'dated', date: '2026-11-20', kind: 'installation', reason: 'Explicit date.', evidence: [{ kind: 'note', reference: 'note-1', observedAt: '2026-11-16', quote: 'Install shower on 20/11/2026.' }] } })

describe('Kanban evidence and manual ownership rules', () => {
  it('accepts exact source-backed product dates and rejects invented or cross-product evidence', () => {
    expect(validateAssessmentOutput(output(), context)[0]).toMatchObject({ status: 'dated', date: '2026-11-20' })
    expect(() => validateAssessmentOutput(output('Install shower on 21/11/2026.'), context)).toThrow('absent from source')
    expect(() => validateAssessmentOutput(output(), { ...context, sources: [{ ...context.sources[0], kind: 'item', item: 'p1' }] })).toThrow('another product')
    expect(() => validateAssessmentOutput({ results: output().results.slice(0, 1) }, context)).toThrow('Incomplete')
  })
  it('keeps ambiguous product scope, internal bookings, uncertainty and unsupported years in review', () => {
    for (const text of ['Install on 20/11/2026.', 'Internal booking: install shower 20/11/2026.', 'Tentative install shower 20/11/2026.', 'Install shower on 20/11.']) {
      const raw = output(text)
      if (text === 'Install on 20/11/2026.') raw.results[0].productCue = 'glass'
      expect(validateAssessmentOutput(raw, { ...context, sources: [{ ...context.sources[0], text, observedAt: null }] })[0].status).toBe('review')
    }
    const wrongDate = output(); wrongDate.results[0].date = '2026-11-21'
    expect(validateAssessmentOutput(wrongDate, context)[0].status).toBe('review')
  })
  it('recalculates the window from a cached date and never overwrites staff dates', () => {
    const auto = parseManualState({}), record = stored()
    expect(resolveProductPlanning(null, auto, record, true, '2026-11-16')).toMatchObject({ inDueWindow: true, dateSource: 'detected' })
    expect(resolveProductPlanning(null, auto, record, true, '2026-11-21')).toMatchObject({ inDueWindow: false, focus: 'overdue' })
    expect(resolveProductPlanning('2027-01-01', auto, record, true, '2026-11-16')).toMatchObject({ planningDate: '2027-01-01', inDueWindow: false, dateSource: 'staff' })
    expect(resolveProductPlanning(null, auto, record, false, '2026-11-16')).toMatchObject({ planningDate: null, inDueWindow: false })
  })
  it('lets explicit manual Y/N/? override automatic membership, including old dates', () => {
    const record = stored()
    expect(resolveProductPlanning('2026-10-01', parseManualState({ focus: 'include' }), record, true, '2026-11-16').inDueWindow).toBe(true)
    expect(resolveProductPlanning(null, parseManualState({ focus: 'exclude' }), record, true, '2026-11-16').inDueWindow).toBe(false)
    expect(resolveProductPlanning(null, parseManualState({ focus: 'unknown' }), record, true, '2026-11-16')).toMatchObject({ inDueWindow: false, focus: 'unknown' })
  })
  it('requires supported temporal wording and checks absolute and relative dates against the quote', () => {
    const assess = (text: string, date: string, observedAt: string | null = '2026-11-17 10:00:00') => {
      const raw = output(text); raw.results[0].date = date
      return validateAssessmentOutput(raw, { ...context, sources: [{ ...context.sources[0], text, observedAt }] })[0].status
    }
    expect(assess('The shower installation details are ready.', '2026-11-20')).toBe('review')
    expect(assess('Install shower in the next few weeks.', '2026-12-05')).toBe('review')
    expect(assess('Install shower tomorrow.', '2026-12-05')).toBe('review')
    expect(assess('Install shower tomorrow.', '2026-11-18')).toBe('dated')
    expect(assess('Install shower tomorrow.', '2026-11-18', null)).toBe('review')
    expect(assess('Install shower on 20 November 2026.', '2026-12-05')).toBe('review')
    expect(assess('Install shower on 20 November 2026.', '2026-11-20', null)).toBe('dated')
    expect(assess('Install shower in 2 weeks.', '2026-12-01')).toBe('dated')
    expect(assess('Install shower tomorrow.', '2026-11-18', '2026-11-16T12:00:00Z')).toBe('dated')
  })
  it('marks old rules stale for both display and automatic planning', () => {
    const record = { ...stored(), rules: 'outdated-rules' }
    expect(assessmentIsCurrent(record, 'snapshot', new Date('2026-11-15T00:00:00Z'))).toBe(false)
    expect(resolveProductPlanning(null, parseManualState({}), record, true, '2026-11-16')).toMatchObject({ planningDate: null, inDueWindow: false })
  })
})
