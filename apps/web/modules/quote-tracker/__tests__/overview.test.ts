import { describe, expect, it } from 'vitest'
import { buildAttentionRows, type AttentionCandidate } from '../overview'

const now = new Date('2026-10-22T03:00:00Z')

function candidate(overrides: Partial<AttentionCandidate> = {}): AttentionCandidate {
  return {
    id: 'quote-1',
    clientName: 'Ada',
    workOrderId: 'Q100',
    statusTag: 'cold',
    totalOpens: 0,
    forwardingSuspected: false,
    lastOpenedAt: null,
    expiresAt: new Date('2026-11-22T03:00:00Z'),
    ...overrides,
  }
}

describe('buildAttentionRows', () => {
  it('deduplicates a quote and explains every applicable attention signal', () => {
    const quote = candidate({
      statusTag: 'hot',
      totalOpens: 3,
      forwardingSuspected: true,
      lastOpenedAt: new Date('2026-10-21T03:00:00Z'),
      expiresAt: new Date('2026-10-25T03:00:00Z'),
    })

    expect(buildAttentionRows([[quote], [quote]], now)).toEqual([{
      ...quote,
      reasons: ['Hot status (may be manual)', 'Opened more than once', 'Possible forwarding', 'Link expires soon'],
    }])
  })

  it('distinguishes never opened from a repeat open and keeps the queue bounded', () => {
    const never = candidate()
    const repeat = candidate({ id: 'quote-2', totalOpens: 2, lastOpenedAt: now })
    expect(buildAttentionRows([[never], [repeat]], now).map((row) => row.reasons)).toEqual([
      ['No opens yet'],
      ['Opened more than once'],
    ])
  })

  it('keeps all four attention signal groups represented in a full queue', () => {
    const groups = [
      Array.from({ length: 6 }, (_, index) => candidate({ id: `hot-${index}`, totalOpens: 1, statusTag: 'hot' })),
      Array.from({ length: 6 }, (_, index) => candidate({ id: `forward-${index}`, totalOpens: 1, forwardingSuspected: true })),
      Array.from({ length: 6 }, (_, index) => candidate({ id: `expiry-${index}`, totalOpens: 1, expiresAt: new Date('2026-10-25T03:00:00Z') })),
      Array.from({ length: 6 }, (_, index) => candidate({ id: `never-${index}` })),
    ]

    const rows = buildAttentionRows(groups, now)
    expect(rows).toHaveLength(12)
    expect(rows.filter((row) => row.id.startsWith('hot-'))).toHaveLength(3)
    expect(rows.filter((row) => row.id.startsWith('forward-'))).toHaveLength(3)
    expect(rows.filter((row) => row.id.startsWith('expiry-'))).toHaveLength(3)
    expect(rows.filter((row) => row.id.startsWith('never-'))).toHaveLength(3)
  })

  it('does not claim observed high interest from a manually hot unopened quote', () => {
    expect(buildAttentionRows([[candidate({ statusTag: 'hot' })]], now)[0]?.reasons).toEqual([
      'No opens yet',
      'Hot status (may be manual)',
    ])
  })
})
