import { describe, expect, it } from 'vitest'

import { parseQuoteListFilters } from '../list-filters'

describe('parseQuoteListFilters', () => {
  it('uses dashboard defaults', () => {
    expect(parseQuoteListFilters({})).toEqual({
      trackedIn: 'all', outcome: 'all',
      search: '',
      status: 'all',
      linkStatus: 'active',
      sort: 'last_opened',
      page: 1,
      size: 5,
      activity: 'all',
    })
  })

  it('accepts valid search, status, sort, page, and page size', () => {
    expect(parseQuoteListFilters({
      search: 'Acme',
      status: 'cold',
      linkStatus: 'expired',
      sort: 'interest_desc',
      page: '3',
      size: '50',
    })).toEqual({
      trackedIn: 'all', outcome: 'all',
      search: 'Acme',
      status: 'cold',
      linkStatus: 'expired',
      sort: 'interest_desc',
      page: 3,
      size: 50,
      activity: 'all',
    })
  })

  it('accepts a page size of 5', () => {
    expect(parseQuoteListFilters({ size: '5' }).size).toBe(5)
  })

  it('preserves dashboard scope, including prefixed parameters on shared pages', () => {
    expect(parseQuoteListFilters({ trackedIn: '14', outcome: 'open', activity: 'unopened_3_days' })).toMatchObject({ trackedIn: '14', outcome: 'open', activity: 'unopened_3_days' })
    expect(parseQuoteListFilters({ quotes_trackedIn: '7', quotes_outcome: 'open' }, { prefix: 'quotes_' })).toMatchObject({ trackedIn: '7', outcome: 'open' })
    expect(parseQuoteListFilters({ trackedIn: 'bad', outcome: 'bad' })).toMatchObject({ trackedIn: 'all', outcome: 'all' })
  })

  it('accepts a page size of 10', () => {
    expect(parseQuoteListFilters({ size: '10' }).size).toBe(10)
  })

  it('falls back when params are invalid', () => {
    expect(parseQuoteListFilters({
      search: ['first', 'second'],
      status: 'sleepy',
      linkStatus: 'broken',
      sort: 'newest',
      page: '-1',
      size: '100',
    })).toEqual({
      trackedIn: 'all', outcome: 'all',
      search: 'first',
      status: 'all',
      linkStatus: 'active',
      sort: 'last_opened',
      page: 1,
      size: 5,
      activity: 'all',
    })
  })

  it.each(['active', 'expired', 'all'] as const)('accepts %s as a link status', (linkStatus) => {
    expect(parseQuoteListFilters({ linkStatus }).linkStatus).toBe(linkStatus)
  })
})

describe('parseQuoteListFilters – activity filter', () => {
  it('returns activity: expiring when activity=expiring is in URL params', () => {
    expect(parseQuoteListFilters({ activity: 'expiring' }).activity).toBe('expiring')
  })

  it('returns activity: never_opened when activity=never_opened is in URL params', () => {
    expect(parseQuoteListFilters({ activity: 'never_opened' }).activity).toBe('never_opened')
  })

  it('returns activity: forwarding when activity=forwarding is in URL params', () => {
    expect(parseQuoteListFilters({ activity: 'forwarding' }).activity).toBe('forwarding')
  })

  it('returns activity: gone_cold when activity=gone_cold is in URL params', () => {
    expect(parseQuoteListFilters({ activity: 'gone_cold' }).activity).toBe('gone_cold')
  })

  it('returns activity: all for unknown values', () => {
    expect(parseQuoteListFilters({ activity: 'bogus' }).activity).toBe('all')
  })
})
