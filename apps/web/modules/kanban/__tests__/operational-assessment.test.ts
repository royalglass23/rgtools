import { describe, expect, it } from 'vitest'
import { validateOperationalAssessmentOutput } from '../operational-assessment'
import type { AssessmentContext } from '../assessment'
import { unknownFields } from './operational-fixtures'

const context: AssessmentContext = { items: [{ token: 'p0', text: 'Shower ensuite' }], sources: [{ token: 's0', kind: 'note', item: null, observedAt: '2026-11-17T00:00:00Z', reference: 'synthetic-note', text: 'Shower glass ordered on 17/11/2026.' }] }
function proposal(field: string, value: string, quote: string, extra: Record<string, unknown> = {}) {
  return { results: [{ item: 'p0', fields: { ...unknownFields(), [field]: { status: 'assessed', value, date: null, datePurpose: null, scope: 'product', productCue: 'shower', reason: 'Proposed from source.', evidence: [{ source: 's0', quote }], ...extra } } }] }
}
describe('field-specific Kanban operational evidence', () => {
  it('reviews unclear job-level scope even for one product while retaining direct item-attached proof', () => {
    const text = 'Shower glass is ready.'
    const raw = proposal('glassReady', 'yes', text, { scope: 'unclear', productCue: null })
    expect(validateOperationalAssessmentOutput(raw, { ...context, sources: [{ ...context.sources[0], text }] })[0].fields.glassReady).toMatchObject({ status: 'review', value: null })
    expect(validateOperationalAssessmentOutput(raw, { ...context, sources: [{ ...context.sources[0], kind: 'item', item: 'p0', text }] })[0].fields.glassReady).toMatchObject({ status: 'assessed', value: 'yes' })
  })
  it('does not turn an order into glass readiness even when the quote is exact', () => {
    const result = validateOperationalAssessmentOutput(proposal('glassReady', 'yes', context.sources[0].text), context)[0]
    expect(result.fields.glassReady).toMatchObject({ status: 'review', value: null })
    expect(result.fields.ps1Issued.value).toBeNull()
  })
  it.each([
    ['siteReady', 'yes', 'Shower site is ready for installation.'],
    ['hardwareReady', 'no', 'Shower hardware is not ready.'],
    ['glassReady', 'na', 'No shower glass is required.'],
  ])('accepts explicit %s %s evidence', (field, value, text) => {
    const result = validateOperationalAssessmentOutput(proposal(field, value, text), { ...context, sources: [{ ...context.sources[0], text }] })[0]
    expect(result.fields[field as keyof typeof result.fields]).toMatchObject({ status: 'assessed', value })
  })
  it('retains an expected arrival date without claiming readiness or treating elapsed ETA as arrival', () => {
    const text = 'Shower glass is expected on 20/11/2026.'
    const result = validateOperationalAssessmentOutput(proposal('glassReady', 'unknown', text, { date: '2026-11-20', datePurpose: 'expected' }), { ...context, sources: [{ ...context.sources[0], text }] })[0]
    expect(result.fields.glassReady).toMatchObject({ status: 'assessed', value: 'unknown', date: '2026-11-20', datePurpose: 'expected' })
    expect(validateOperationalAssessmentOutput(proposal('glassReady', 'yes', text), { ...context, sources: [{ ...context.sources[0], text }] })[0].fields.glassReady.value).toBeNull()
  })
  it.each([
    ['designConfirmed', 'yes', 'Shower design is confirmed.', 'yes'],
    ['ps1Required', 'yes', 'Shower PS1 is required.', 'yes'],
    ['ps3Required', 'no', 'Shower PS3 is not required.', 'no'],
    ['ps1Issued', 'yes', 'Shower PS1 was issued.', 'yes'],
    ['ps3Issued', 'no', 'Shower PS3 has not been issued.', 'no'],
    ['bottleStrut', 'yes', 'Shower bottle strut is required.', 'yes'],
    ['buildingConsent', 'approved', 'Shower building consent is approved.', 'approved'],
    ['buildingConsentNumber', 'BCO1234567', 'Shower building consent number BCO1234567.', 'BCO1234567'],
    ['minorVariationRequired', 'no', 'Shower minor variation is not required.', 'no'],
    ['aftercare', 'yes', 'Shower aftercare is required.', 'yes'],
    ['clientWaitingFor', 'glass arrival', 'Shower client is waiting for glass arrival.', 'glass arrival'],
    ['materialsEta', '2026-11-20', 'Shower materials ETA is 20/11/2026.', '2026-11-20'],
    ['installerId', 'i0', 'Shower installer is Synthetic Installer.', 'configured-id'],
    ['estimatedHours', '2.5', 'Shower estimated labour: 2.5 hours.', '2.5'],
  ])('accepts an explicitly supported %s value', (field, value, text, expected) => {
    const prepared = { ...context, installers: [{ token: 'i0', name: 'Synthetic Installer', id: 'configured-id' }], sources: [{ ...context.sources[0], text }] }
    const result = validateOperationalAssessmentOutput(proposal(field, value, text), prepared)[0]
    expect(result.fields[field as keyof typeof result.fields]).toMatchObject({ status: 'assessed', value: expected })
  })
  it.each([
    ['ps1Issued', 'yes', 'Shower PS1 fee included.'],
    ['minorVariationRequired', 'yes', 'Shower PS1 is required.'],
    ['buildingConsent', 'approved', 'Shower BC is required; consent number BCO1234567.'],
    ['buildingConsent', 'not_required', 'Shower building consent is not required.'],
    ['hardwareReady', 'no', 'Shower hardware ETA is 20/11/2026.'],
    ['estimatedHours', '2.5', 'Shower recorded actual labour: 2.5 hours.'],
    ['glassReady', 'yes', 'Is shower glass ready?'],
    ['glassReady', 'yes', 'Please confirm shower glass is ready.'],
    ['glassReady', 'yes', 'If shower glass is ready, book installation.'],
    ['glassReady', 'yes', 'Shower glass arrived damaged.'],
    ['designConfirmed', 'yes', 'Shower quote accepted.'],
    ['ps3Issued', 'yes', 'Shower PS3 will be issued.'],
    ['aftercare', 'yes', 'Shower job completed.'],
    ['bottleStrut', 'na', 'Shower uses a standard system.'],
  ])('leaves unsupported %s conclusions for review', (field, value, text) => {
    expect(validateOperationalAssessmentOutput(proposal(field, value, text), { ...context, sources: [{ ...context.sources[0], text }] })[0].fields[field as keyof ReturnType<typeof validateOperationalAssessmentOutput>[number]['fields']]).toMatchObject({ status: 'review', value: null })
  })
  it('keeps field meanings within their product clause and refuses cross-product evidence', () => {
    const text = 'Shower glass is ready; balustrade hardware is not ready.'
    const prepared = { ...context, items: [...context.items, { token: 'p1', text: 'Balustrade deck' }], sources: [{ ...context.sources[0], text }] }
    const raw = proposal('hardwareReady', 'no', text)
    raw.results.push({ item: 'p1', fields: unknownFields() })
    expect(validateOperationalAssessmentOutput(raw, prepared)[0].fields.hardwareReady).toMatchObject({ status: 'review', value: null })
    const good = proposal('glassReady', 'yes', text)
    good.results.push({ item: 'p1', fields: unknownFields() })
    expect(validateOperationalAssessmentOutput(good, prepared)[0].fields.glassReady.value).toBe('yes')
  })
  it('reviews an older readiness claim when newer applicable evidence contradicts it, but ignores unrelated newer evidence', () => {
    const old = 'Shower glass is ready.'
    const raw = proposal('glassReady', 'yes', old)
    const prepared = { ...context, sources: [{ ...context.sources[0], text: old }, { ...context.sources[0], token: 's1', observedAt: '2026-11-18T00:00:00Z', text: 'Shower glass is not ready.' }] }
    expect(validateOperationalAssessmentOutput(raw, prepared)[0].fields.glassReady).toMatchObject({ status: 'review', value: null })
    prepared.sources[1].text = 'Shower hardware is not ready.'
    expect(validateOperationalAssessmentOutput(raw, prepared)[0].fields.glassReady.value).toBe('yes')
  })
  it('reports unavailable document coverage and rejects an incomplete product field set', () => {
    const raw = { results: [{ item: 'p0', fields: unknownFields() }] }
    const result = validateOperationalAssessmentOutput(raw, { ...context, coverage: { documents: { state: 'unsupported', reason: 'No document content.' }, note: { state: 'complete', reason: 'Selected text slice.' } } })[0]
    expect(result.fields.ps1Issued).toMatchObject({ status: 'unsupported', value: null, coverage: { unsupported: ['documents'] } })
    delete raw.results[0].fields.ps1Issued
    expect(() => validateOperationalAssessmentOutput(raw, context)).toThrow('Incomplete operational')
  })
  it('keeps requirement changes separate from an existing issuance observation', () => {
    const old = 'Shower PS1 was issued.'
    const prepared = { ...context, sources: [{ ...context.sources[0], text: old }, { ...context.sources[0], token: 's1', observedAt: '2026-11-18T00:00:00Z', text: 'Shower PS1 is no longer required.' }] }
    expect(validateOperationalAssessmentOutput(proposal('ps1Issued', 'yes', old), prepared)[0].fields.ps1Issued.value).toBe('yes')
    prepared.sources[1].text = 'Please check whether shower PS1 has not been issued.'
    expect(validateOperationalAssessmentOutput(proposal('ps1Issued', 'yes', old), prepared)[0].fields.ps1Issued.value).toBe('yes')
  })
  it('treats untimed contradictions as unknown order and refuses forged literal installer tokens', () => {
    const old = 'Shower glass is ready.'
    const prepared = { ...context, sources: [{ ...context.sources[0], text: old }, { ...context.sources[0], token: 's1', kind: 'custom_field' as const, observedAt: null, text: 'Shower glass is not ready.' }] }
    expect(validateOperationalAssessmentOutput(proposal('glassReady', 'yes', old), prepared)[0].fields.glassReady.value).toBeNull()
    const text = 'Shower installer is i0.'
    const source = { ...context.sources[0], text }
    const installerContext = { ...context, installers: [{ token: 'i0', name: 'Synthetic Installer', id: 'safe-id' }], sources: [source] }
    expect(validateOperationalAssessmentOutput(proposal('installerId', 'i0', text), installerContext)[0].fields.installerId.value).toBeNull()
    expect(validateOperationalAssessmentOutput(proposal('installerId', 'i0', text), { ...installerContext, sources: [{ ...source, installerTokens: ['i0'] }] })[0].fields.installerId.value).toBe('safe-id')
  })
  it.each([
    ['ps1Required', 'No PS1 required for the shower.'],
    ['aftercare', 'No aftercare required for the shower.'],
    ['glassReady', 'No shower glass ready.'],
    ['designConfirmed', 'No design approved for the shower.'],
  ])('never accepts Yes for leading-negated %s evidence', (field, text) => {
    expect(validateOperationalAssessmentOutput(proposal(field, 'yes', text), { ...context, sources: [{ ...context.sources[0], text }] })[0].fields[field as keyof ReturnType<typeof validateOperationalAssessmentOutput>[number]['fields']]).toMatchObject({ status: 'review', value: null })
  })
  it.each([
    ['glassReady', 'yes', '淋浴房玻璃已到货。'],
    ['glassReady', 'no', '淋浴房玻璃未到货。'],
    ['ps1Required', 'yes', '淋浴房需要PS1。'],
    ['ps1Required', 'no', '淋浴房不需要PS1。'],
    ['ps1Issued', 'yes', '淋浴房PS1已签发。'],
  ])('accepts narrowly supported Chinese %s %s confirmations', (field, value, text) => {
    expect(validateOperationalAssessmentOutput(proposal(field, value, text), { ...context, sources: [{ ...context.sources[0], text }] })[0].fields[field as keyof ReturnType<typeof validateOperationalAssessmentOutput>[number]['fields']]).toMatchObject({ status: 'assessed', value })
  })
  it('keeps comma-separated products local and cannot trim away source negation', () => {
    const text = 'Shower glass is ready, balustrade hardware is not ready.'
    const raw = proposal('hardwareReady', 'no', text); raw.results.push({ item: 'p1', fields: unknownFields() })
    expect(validateOperationalAssessmentOutput(raw, { ...context, items: [...context.items, { token: 'p1', text: 'Balustrade deck' }], sources: [{ ...context.sources[0], text }] })[0].fields.hardwareReady.value).toBeNull()
    expect(validateOperationalAssessmentOutput(proposal('ps1Required', 'yes', 'PS1 required'), { ...context, sources: [{ ...context.sources[0], text: 'No PS1 required for the shower.' }] })[0].fields.ps1Required.value).toBeNull()
  })
  it('does not convert readiness to order or manufacture into actual material readiness', () => {
    for (const [field, text] of [['glassReady', 'Shower glass is ready to order.'], ['hardwareReady', 'Shower hardware is ready for manufacturing.']]) {
      expect(validateOperationalAssessmentOutput(proposal(field, 'yes', text), { ...context, sources: [{ ...context.sources[0], text }] })[0].fields[field as keyof ReturnType<typeof validateOperationalAssessmentOutput>[number]['fields']].value).toBeNull()
    }
  })
})
