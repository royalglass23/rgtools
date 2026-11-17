// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { effectiveProductFields } from '../effective-fields'
import { effectiveProduct } from './effective-fixtures'

describe('shared effective product fields', () => {
  it('exposes every independently specified current value without consent polarity conversion or installer assignment', () => {
    const product = effectiveProduct(), resolved = effectiveProductFields(product)
    expect(Object.fromEntries(Object.entries(resolved.fields).map(([key, field]) => [key, field.value]))).toEqual({
      siteReady: 'yes', glassReady: 'unknown', hardwareReady: 'no', designConfirmed: 'yes', ps1Required: 'yes', ps3Required: 'no', minorVariationRequired: 'no', aftercare: 'na', ps1Issued: 'no', ps3Issued: 'yes', bottleStrut: 'no', buildingConsent: 'approved',
      clientWaitingFor: 'glass arrival', materialsEta: '2026-11-21', estimatedHours: '2.5', notes: '', focus: 'auto', installDate: '2026-11-22', installerId: '40600000-0000-4000-8000-000000000030', buildingConsentNumber: 'BCO1234567',
    })
    expect(resolved.fields.buildingConsent).toMatchObject({ origin: 'Auto', value: 'approved' })
    expect(resolved.manual.buildingConsent).toBe('unknown')
    expect(product.installerId).toBeNull(); expect(product.installDate).toBeNull()
    expect(resolved.readinessDates).toEqual({ siteReady: { date: '2026-11-18', datePurpose: 'ready' }, glassReady: { date: '2026-11-21', datePurpose: 'expected' } })
    expect(resolved.summary).toBe('Synthetic generated readiness summary.'); expect(resolved.manual.notes).toBe('')
  })
  it('gives explicit staff choices and clears precedence over every automatic field they own', () => {
    const product = effectiveProduct()
    for (const field of Object.keys(product.ownership) as Array<keyof typeof product.ownership>) product.ownership[field] = 'staff'
    product.legacyOwnership = true
    product.manual.siteReady = 'no'; product.manual.buildingConsent = 'na'; product.manual.notes = 'Staff inspection'
    product.readinessDates = { siteReady: { date: '2026-11-20', datePurpose: 'expected' } }
    const resolved = effectiveProductFields(product)
    expect(resolved.manual).toEqual(product.manual)
    expect(resolved.fields.installDate.value).toBeNull(); expect(resolved.fields.installerId.value).toBeNull()
    expect(resolved.fields.estimatedHours.value).toBe(''); expect(resolved.fields.clientWaitingFor.value).toBe('')
    expect(resolved.fields.buildingConsent).toMatchObject({ value: 'na', origin: 'Staff / legacy', status: 'staff' })
    expect(resolved.fields.siteReady).toMatchObject({ value: 'no', date: '2026-11-20', datePurpose: 'expected' })
    expect(resolved.fields.buildingConsentNumber.value).toBe('BCO1234567')
  })
  it.each(['stale', 'failed', 'review', 'unsupported', 'unknown', 'pending'] as const)('does not accept %s data as a current automatic field', status => {
    const product = effectiveProduct()
    if (status === 'pending') product.assessment = null
    else if (status === 'stale') product.operationalCurrent = false
    else if (status === 'failed') product.assessment!.state = 'failed'
    else product.assessment!.operational!.fields.siteReady.status = status
    const resolved = effectiveProductFields(product)
    expect(resolved.fields.siteReady).toMatchObject({ status, value: null, date: null, datePurpose: null })
    expect(resolved.manual.siteReady).toBe('unknown')
  })
  it('keeps product values separate and retains per-field quote, reason, authored time, coverage and assessment time', () => {
    const a = effectiveProduct(), b = effectiveProduct(); b.itemId = 'other'; b.assessment!.operational!.fields.siteReady.value = 'no'
    expect(effectiveProductFields(a).fields.siteReady).toMatchObject({ value: 'yes', reason: 'Explicit synthetic product fact.', assessedAt: '2026-11-18T01:00:00Z', evidence: [{ kind: 'note', quote: 'Shower site is ready.', observedAt: '2026-11-18T00:00:00Z' }], coverage: { unsupported: ['photos'] } })
    expect(effectiveProductFields(b).fields.siteReady.value).toBe('no')
  })
})
