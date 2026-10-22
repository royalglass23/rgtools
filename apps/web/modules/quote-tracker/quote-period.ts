export const TRACKED_PERIODS = ['7', '14', '30', 'all'] as const
export type TrackedPeriod = typeof TRACKED_PERIODS[number]
export const DAY_MS = 24 * 60 * 60 * 1000

export function parseTrackedIn(value: string | string[] | undefined, fallback: TrackedPeriod = '30'): TrackedPeriod {
  const first = Array.isArray(value) ? value[0] : value
  return TRACKED_PERIODS.find((period) => period === first) ?? fallback
}

export function trackedSince(period: TrackedPeriod, now: Date): Date | null {
  return period === 'all' ? null : new Date(now.getTime() - Number(period) * DAY_MS)
}

export function trackedPeriodLabel(period: TrackedPeriod) {
  return period === 'all' ? 'All time' : `Last ${period} days`
}

export function trackedQuoteListHref(period: TrackedPeriod, filter: { status?: string; activity?: string; outcome?: string; linkStatus?: string } = {}) {
  const params = new URLSearchParams({ trackedIn: period, linkStatus: 'active', outcome: 'open', ...filter })
  return `/quote-tracker?${params}`
}
