import { trackedQuoteListHref, type TrackedPeriod } from './quote-period'

export const QUOTE_PROGRESS_GROUPS = [
  { id: 'waiting', label: 'Unopened — under 3 days', detail: 'Recently tracked', activity: 'unopened_under_3_days' },
  { id: 'overdue', label: 'Unopened — 3+ days', detail: 'Check receipt / follow-up', activity: 'unopened_3_days' },
  { id: 'once', label: 'Opened once', detail: 'Quote has been seen', activity: 'opened_once' },
  { id: 'repeat', label: 'Opened multiple times', detail: 'Review repeat activity', activity: 'opened_multiple' },
  { id: 'won', label: 'Won', detail: 'Confirmed outcome' },
  { id: 'lost', label: 'Lost', detail: 'Confirmed outcome' },
] as const

export type QuoteProgressGroup = typeof QUOTE_PROGRESS_GROUPS[number]['id']
export type QuoteProgressBucket = { id: QuoteProgressGroup; count: number; totalValue: string }

export function quoteProgressHref(period: TrackedPeriod, id: QuoteProgressGroup) {
  const group = QUOTE_PROGRESS_GROUPS.find((entry) => entry.id === id)!
  return 'activity' in group
    ? trackedQuoteListHref(period, { activity: group.activity })
    : trackedQuoteListHref(period, { outcome: id, linkStatus: 'all' })
}

/** Lower-bound abbreviations: the plus indicates that the exact value may be higher. */
export function compactQuoteValue(value: string | number) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '$0'
  const magnitude = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (magnitude >= 1_000_000) return `${sign}$${(Math.floor(magnitude / 100_000) / 10).toFixed(1)}m+`
  if (magnitude >= 1_000) return `${sign}$${Math.floor(magnitude / 1_000).toLocaleString('en-NZ')}k+`
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(amount)
}
