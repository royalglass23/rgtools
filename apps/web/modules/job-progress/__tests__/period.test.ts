import { describe, expect, it } from 'vitest'
import { parseJobProgressDays, updatedWithinDays } from '../period'

describe('Job Progress update periods', () => {
  const asOf = '2026-10-23T00:00:00.000Z' // 23 Oct 13:00 NZDT

  it('defaults to seven days and accepts only the supported choices', () => {
    expect(parseJobProgressDays('')).toBe(7)
    expect(parseJobProgressDays('14')).toBe(14)
    expect(parseJobProgressDays('30')).toBe(30)
    expect(parseJobProgressDays('all')).toBe('all')
    expect(parseJobProgressDays('365')).toBe(7)
  })

  it('uses a rolling NZ-local boundary and excludes missing or future edits', () => {
    expect(updatedWithinDays('2026-10-16 13:00:00', asOf, 7)).toBe(true)
    expect(updatedWithinDays('2026-10-16 12:59:59', asOf, 7)).toBe(false)
    expect(updatedWithinDays('2026-10-23 13:00:00', asOf, 7)).toBe(false)
    expect(updatedWithinDays(null, asOf, 7)).toBe(false)
    expect(updatedWithinDays(null, asOf, 'all')).toBe(true)
  })

  it('handles the NZ daylight saving transition as an elapsed seven-day period', () => {
    const afterTransition = '2026-09-30T00:00:00.000Z' // 30 Sep 13:00 NZDT
    expect(updatedWithinDays('2026-09-23 12:00:00', afterTransition, 7)).toBe(true)
    expect(updatedWithinDays('2026-09-23 11:59:59', afterTransition, 7)).toBe(false)
  })
})
