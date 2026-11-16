import { describe, expect, it } from 'vitest'
import { supportedEvidenceDates } from '../temporal-evidence'
import { ASSESSMENT_RULES, resolveProductPlanning, validateAssessmentOutput, type AssessmentContext } from '../assessment'
import { parseManualState } from '../work-orders'

describe('timestamp-anchored installation evidence from live date formats', () => {
  it('accepts a yearless named date in a dated email and puts the product in the due view', () => {
    const quote = 'We have tentatively scheduled the installation for Tuesday, 1 December, subject to your confirmation and suitable weather conditions.'
    const context: AssessmentContext = { items: [{ token: 'p0', text: 'Glass balustrade' }], sources: [{ token: 's0', item: null, kind: 'email', observedAt: '2026-11-16 16:00:31', reference: null, text: quote }] }
    const [result] = validateAssessmentOutput({ results: [{ item: 'p0', status: 'dated', date: '2026-12-01', kind: 'installation', scope: 'product', productCue: null, reason: 'An unconfirmed installation plan stated by email.', evidence: [{ source: 's0', quote }] }] }, context)
    expect(result.status).toBe('dated')
    expect(resolveProductPlanning(null, parseManualState({}), { state: 'complete', rules: ASSESSMENT_RULES, model: 'fixture', sourceHash: 'hash', snapshotHash: 'snapshot', checkedAt: '2026-11-17T00:00:00Z', assessedAt: '2026-11-17T00:00:00Z', result, error: null }, true, '2026-11-17').inDueWindow).toBe(true)
  })
  it('anchors named and numeric day/month dates to the source year, including New Year', () => {
    expect(supportedEvidenceDates('Install Tuesday, 17 November.', '2026-11-13 14:06:17')).toContain('2026-11-17')
    expect(supportedEvidenceDates('Installation booked for 27/11.', '2025-11-26 15:58:11')).toContain('2025-11-27')
    expect(supportedEvidenceDates('Install January 5.', '2026-12-28 10:00:00')).toContain('2027-01-05')
    expect(supportedEvidenceDates('Installed 29 December.', '2027-01-02 10:00:00')).toContain('2026-12-29')
    expect(supportedEvidenceDates('Install 01/12/2025.', '2026-11-16')).not.toContain('2026-12-01')
    expect(supportedEvidenceDates('Install 25/11/06.', '2026-06-08')).not.toContain('2026-06-11')
    expect(supportedEvidenceDates('Install 1 December 25.', '2026-11-16')).not.toContain('2026-12-01')
  })
  it('requires an anchor and rejects distant, invalid or weekday-contradicting dates', () => {
    expect(supportedEvidenceDates('Install on 1 December.', null)).toEqual([])
    expect(supportedEvidenceDates('Install on 1 June.', '2026-11-16')).toEqual([])
    expect(supportedEvidenceDates('Install on 31 November.', '2026-11-16')).toEqual([])
    expect(supportedEvidenceDates('Install Monday, 1 December.', '2026-11-16')).toEqual([])
    expect(supportedEvidenceDates('Install Monday the 1 December.', '2026-11-16')).toEqual([])
    expect(supportedEvidenceDates('Install 1 December (Monday).', '2026-11-16')).toEqual([])
    expect(supportedEvidenceDates('Install Tuesday the 1 December.', '2026-11-16')).toContain('2026-12-01')
    expect(supportedEvidenceDates('Install 1 December (Tuesday).', '2026-11-16')).toContain('2026-12-01')
    expect(supportedEvidenceDates('Install in the next few weeks.', '2026-11-16')).toEqual([])
  })
})
