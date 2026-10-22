import { describe, expect, it } from 'vitest'
import { parseTrackedIn, trackedSince, trackedQuoteListHref } from '../quote-period'

describe('Quotes tracked in', () => {
  it('defaults to 30 days and accepts only the offered periods', () => {
    expect(parseTrackedIn(undefined)).toBe('30')
    expect(parseTrackedIn('invalid')).toBe('30')
    for (const period of ['7', '14', '30', 'all'] as const) expect(parseTrackedIn(period)).toBe(period)
  })

  it('uses a rolling creation window and removes the lower bound for All time', () => {
    const now = new Date('2026-10-23T12:00:00Z')
    expect(trackedSince('7', now)).toEqual(new Date('2026-10-16T12:00:00Z'))
    expect(trackedSince('14', now)).toEqual(new Date('2026-10-09T12:00:00Z'))
    expect(trackedSince('all', now)).toBeNull()
  })

  it('carries the period, active links, unresolved outcomes and card filter to Track Quotes', () => {
    const url = new URL(trackedQuoteListHref('14', { status: 'hot' }), 'https://test.local')
    expect(url.pathname).toBe('/quote-tracker')
    expect(Object.fromEntries(url.searchParams)).toEqual({ trackedIn: '14', linkStatus: 'active', outcome: 'open', status: 'hot' })
    expect(new URL(trackedQuoteListHref('all', { activity: 'unopened_3_days' }), 'https://test.local').searchParams.get('activity')).toBe('unopened_3_days')
  })
})
