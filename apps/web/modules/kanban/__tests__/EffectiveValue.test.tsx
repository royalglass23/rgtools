import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EffectiveValue } from '../EffectiveValue'
import { effectiveProductFields } from '../effective-fields'
import { effectiveProduct } from './effective-fixtures'

beforeEach(() => vi.stubEnv('TZ', 'UTC'))
afterEach(() => vi.unstubAllEnvs())
describe('field evidence authored-time precision', () => {
  it.each([
    ['2026-11-18', 'Authored: 18/11/2026 (date only; Auckland)'],
    ['2026-11-18 10:30:00', 'Authored: 18/11/2026, 10:30:00 (Auckland source time)'],
    ['invalid-source-date', 'Authored time unknown'],
  ])('preserves the supplied precision for %s', (observedAt, expected) => {
    const field = effectiveProductFields(effectiveProduct()).fields.siteReady
    field.evidence[0].observedAt = observedAt
    render(<EffectiveValue field={field} label="Site ready" />)
    fireEvent.click(screen.getByLabelText('Evidence for Site ready'))
    expect(screen.getByText(expected, { exact: true })).toBeInTheDocument()
  })
  it.each(['description', 'custom_field'] as const)('does not invent an authored time for %s evidence', kind => {
    const field = effectiveProductFields(effectiveProduct()).fields.siteReady
    field.evidence[0].kind = kind
    render(<EffectiveValue field={field} label="Site ready" />)
    fireEvent.click(screen.getByLabelText('Evidence for Site ready'))
    expect(screen.getByText('Authored time unknown', { exact: true })).toBeInTheDocument()
  })
  it('retains Auckland conversion for explicitly offset authored and assessment timestamps', () => {
    const field = effectiveProductFields(effectiveProduct()).fields.siteReady
    field.evidence[0].observedAt = '2026-11-17T21:30:00Z'
    render(<EffectiveValue field={field} label="Site ready" />)
    fireEvent.click(screen.getByLabelText('Evidence for Site ready'))
    expect(screen.getByText('Authored: 18/11/2026, 10:30:00 am (Auckland)', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('Assessed: 18/11/2026, 2:00:00 pm (Auckland)', { exact: true })).toBeInTheDocument()
  })
})
