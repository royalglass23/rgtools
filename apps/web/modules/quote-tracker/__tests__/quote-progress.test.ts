import { describe, expect, it } from 'vitest'
import { compactQuoteValue, QUOTE_PROGRESS_GROUPS, quoteProgressHref } from '../quote-progress'
import { parseQuoteListFilters } from '../list-filters'

describe('quote progress', () => {
  it.each([
    ['0', '$0'], ['633716.12', '$633k+'], [999999, '$999k+'],
    [1000000, '$1.0m+'], [1600000, '$1.6m+'], [1699999, '$1.6m+'],
  ])('formats %s as %s', (value, expected) => expect(compactQuoteValue(value)).toBe(expected))

  it.each(QUOTE_PROGRESS_GROUPS)('retains the selected period and matching filter for $id', (group) => {
    const url = new URL(quoteProgressHref('14', group.id), 'https://test.local')
    const filters = parseQuoteListFilters(Object.fromEntries(url.searchParams))
    expect(filters.trackedIn).toBe('14')
    if ('activity' in group) {
      expect(filters).toMatchObject({ outcome: 'open', linkStatus: 'active', activity: group.activity })
    } else {
      expect(filters).toMatchObject({ outcome: group.id, linkStatus: 'all' })
    }
  })
})
