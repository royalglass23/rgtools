import { describe, expect, it } from 'vitest'
import type { AssessmentContext } from '../assessment'
import { validateOperationalAssessmentOutput } from '../operational-assessment'
import { unknownFields } from './operational-fixtures'

// Q250082: text-only replay of the staff notes behind the bot's waiting summary.
// This does not claim that a historical expectation is a current booking.
const installation = 'The shower tiles should be finished around the end of this month, and we expect to be able to install the shower enclosures in early November.'
const variation = 'Apt 5 -- glass changed to aluminum, price variation ?'
const context: AssessmentContext = {
  items: [{ token: 'p0', text: 'Shower Apt 5' }],
  sources: [
    { token: 's0', kind: 'note', item: null, observedAt: '2026-10-25 21:22:28', reference: 'installation-note', text: installation },
    { token: 's1', kind: 'note', item: null, observedAt: '2026-11-13 13:19:03', reference: 'variation-note', text: variation },
  ],
}
function proposal(value: string, source: string, quote: string, productCue = 'shower'): { results: Array<{ item: string; fields: Record<string, unknown> }> } {
  return { results: [{ item: 'p0', fields: { ...unknownFields(), clientWaitingFor: {
    status: 'assessed', value, date: null, datePurpose: null, scope: 'product', productCue,
    reason: 'Outstanding work described in the staff note, with its original uncertainty retained.',
    evidence: [{ source, quote }],
  } } }] }
}
describe('client waiting summaries from ordinary staff notes', () => {
  it('accepts the Q250082 expected-installation summary without requiring literal waiting-for wording', () => {
    const result = validateOperationalAssessmentOutput(proposal('Shower installation was expected early November; completion unconfirmed.', 's0', installation), context)[0]
    expect(result.fields.clientWaitingFor).toMatchObject({ status: 'assessed', value: 'Shower installation was expected early November; completion unconfirmed.' })
    expect(result.fields.siteReady.value).toBeNull()
  })
  it('accepts a sourced outstanding variation question without converting it into an observed readiness state', () => {
    const result = validateOperationalAssessmentOutput(proposal('Apt 5 glass-to-aluminium change: price variation needs confirmation.', 's1', variation, 'apt 5'), context)[0]
    expect(result.fields.clientWaitingFor).toMatchObject({ status: 'assessed', value: 'Apt 5 glass-to-aluminium change: price variation needs confirmation.' })
  })
  it('still rejects invented quotations', () => {
    expect(validateOperationalAssessmentOutput(proposal('PS3 requested.', 's0', 'Shower PS3 requested.'), context)[0].fields.clientWaitingFor).toMatchObject({ status: 'review', value: null })
  })
  it.each(['The shower is blue.', 'The client is no longer waiting for shower installation.', 'The shower variation was resolved.', 'Shower installation is not required.'])('does not invent outstanding work from %s', text => {
    const prepared = { ...context, sources: [{ ...context.sources[0], text }] }
    expect(validateOperationalAssessmentOutput(proposal('Shower installation is outstanding.', 's0', text), prepared)[0].fields.clientWaitingFor).toMatchObject({ status: 'review', value: null })
  })
  it('does not retain an older installation expectation after a newer applicable completion', () => {
    const prepared = { ...context, sources: [context.sources[0], { ...context.sources[1], text: 'Shower installation was completed.' }] }
    expect(validateOperationalAssessmentOutput(proposal('Shower installation was expected early November; completion unconfirmed.', 's0', installation), prepared)[0].fields.clientWaitingFor).toMatchObject({ status: 'review', value: null })
  })
  it('does not retain an outstanding variation after a newer applicable resolution', () => {
    const prepared = { ...context, sources: [context.sources[1], { ...context.sources[1], token: 's2', observedAt: '2026-11-17 10:00:00', text: 'Apt 5 price variation was resolved.' }] }
    expect(validateOperationalAssessmentOutput(proposal('Apt 5 price variation needs confirmation.', 's1', variation, 'apt 5'), prepared)[0].fields.clientWaitingFor).toMatchObject({ status: 'review', value: null })
  })
  it('still rejects evidence scoped to a different product', () => {
    const raw = proposal('Balustrade installation expected.', 's0', installation, 'balustrade')
    raw.results.push({ item: 'p1', fields: unknownFields() })
    const multiple = { ...context, items: [...context.items, { token: 'p1', text: 'Balustrade stairs' }] }
    expect(validateOperationalAssessmentOutput(raw, multiple)[0].fields.clientWaitingFor).toMatchObject({ status: 'review', value: null })
  })
})
