export type JobProgressDays = 7 | 14 | 30 | 'all'

export function parseJobProgressDays(value: string): JobProgressDays {
  if (value === '14') return 14
  if (value === '30') return 30
  if (value === 'all') return 'all'
  return 7
}

function nzLocalStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

export function updatedWithinDays(lastUpdate: string | null, asOf: string, days: JobProgressDays): boolean {
  if (days === 'all') return true
  if (!lastUpdate) return false
  const end = new Date(asOf)
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  return lastUpdate >= nzLocalStamp(start) && lastUpdate < nzLocalStamp(end)
}
