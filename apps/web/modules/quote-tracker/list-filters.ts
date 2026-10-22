import type { StatusTag } from './score'
import { parseTrackedIn, type TrackedPeriod } from './quote-period'

export type QuoteListStatus = StatusTag | 'all'
export type QuoteLinkStatus = 'active' | 'expired' | 'all'
export type QuoteListSort =
  | 'last_opened'
  | 'client_asc'
  | 'client_desc'
  | 'value_asc'
  | 'value_desc'
  | 'interest_asc'
  | 'interest_desc'
export type QuoteListPageSize = 5 | 10 | 20 | 50

export type QuoteActivity = 'all' | 'expiring' | 'never_opened' | 'unopened_3_days' | 'viewed' | 'forwarding' | 'gone_cold'

export type QuoteListFilters = {
  trackedIn: TrackedPeriod
  outcome: 'all' | 'open'
  search: string
  status: QuoteListStatus
  linkStatus: QuoteLinkStatus
  sort: QuoteListSort
  page: number
  size: QuoteListPageSize
  activity: QuoteActivity
}

export type ParseQuoteListFiltersOptions = {
  /** Prefix applied to every param name, e.g. `quotes_` when the table is embedded alongside others. */
  prefix?: string
  /** Default values (admin-set) used when a param is absent from the URL. */
  defaults?: Partial<Record<'status' | 'sort' | 'size', string>>
}

export function parseQuoteListFilters(
  searchParams: Record<string, string | string[] | undefined>,
  options: ParseQuoteListFiltersOptions = {},
): QuoteListFilters {
  const { prefix = '', defaults = {} } = options
  const pick = (name: 'status' | 'sort' | 'size') =>
    stringValue(searchParams[`${prefix}${name}`]) ?? defaults[name]

  const status = pick('status')
  const linkStatus = stringValue(searchParams[`${prefix}linkStatus`])
  const sort = pick('sort')
  const page = Number(stringValue(searchParams[`${prefix}page`]) ?? '1')
  const size = Number(pick('size') ?? '5')

  return {
    trackedIn: parseTrackedIn(searchParams[`${prefix}trackedIn`], 'all'),
    outcome: stringValue(searchParams[`${prefix}outcome`]) === 'open' ? 'open' : 'all',
    search: (stringValue(searchParams[`${prefix}search`]) ?? '').trim(),
    status: isQuoteListStatus(status) ? status : 'all',
    linkStatus: isQuoteLinkStatus(linkStatus) ? linkStatus : 'active',
    sort: isQuoteListSort(sort) ? sort : 'last_opened',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: size === 5 || size === 10 || size === 20 || size === 50 ? size : 5,
    activity: toQuoteActivity(stringValue(searchParams[`${prefix}activity`])),
  }
}

function stringValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function isQuoteListStatus(value: string | undefined): value is QuoteListStatus {
  return value === 'all' || value === 'hot' || value === 'warm' || value === 'cold' || value === 'dead'
}

function isQuoteLinkStatus(value: string | undefined): value is QuoteLinkStatus {
  return value === 'active' || value === 'expired' || value === 'all'
}

function toQuoteActivity(value: string | undefined): QuoteActivity {
  if (value === 'expiring' || value === 'never_opened' || value === 'unopened_3_days' || value === 'viewed' || value === 'forwarding' || value === 'gone_cold') return value
  return 'all'
}

function isQuoteListSort(value: string | undefined): value is QuoteListSort {
  return (
    value === 'last_opened' ||
    value === 'client_asc' ||
    value === 'client_desc' ||
    value === 'value_asc' ||
    value === 'value_desc' ||
    value === 'interest_asc' ||
    value === 'interest_desc'
  )
}
