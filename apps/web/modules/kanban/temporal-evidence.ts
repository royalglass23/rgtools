import { validDate } from './work-orders'

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const monthPattern = months.map(month => `${month.slice(0, 3)}(?:${month.slice(3)})?`).join('|')

function anchorDay(observedAt: string | null) {
  if (!observedAt) return null
  // ServiceM8's unzoned timestamps are local business time. Zoned timestamps
  // are converted to the Auckland calendar day before relative arithmetic.
  if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(observedAt)) return validDate(observedAt.slice(0, 10)) ? observedAt.slice(0, 10) : null
  const instant = new Date(observedAt)
  if (!Number.isFinite(instant.getTime()) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(observedAt)) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

// Deliberately bounded grammar: unsupported natural-language dates require
// review rather than trusting a model-supplied calendar date.
export function supportedEvidenceDates(quote: string, observedAt: string | null): string[] {
  const dates = new Set<string>()
  const add = (year: string, month: string | number, day: string) => {
    const date = `${year.length === 2 ? '20' + year : year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`
    if (validDate(date)) dates.add(date)
  }
  const text = quote.toLowerCase()
  for (const match of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) add(match[1], match[2], match[3])
  for (const match of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2}|\d{2})\b/g)) add(match[3], match[2], match[1])
  const monthNumber = (name: string) => months.findIndex(month => month.startsWith(name.slice(0, 3))) + 1
  for (const match of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})[,.]?\\s+(20\\d{2})\\b`, 'g'))) add(match[3], monthNumber(match[2]), match[1])
  for (const match of text.matchAll(new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,.]?\\s+(20\\d{2})\\b`, 'g'))) add(match[3], monthNumber(match[1]), match[2])
  for (const match of text.matchAll(/(20\d{2})年(\d{1,2})月(\d{1,2})日/g)) add(match[1], match[2], match[3])
  const anchor = anchorDay(observedAt)
  if (anchor) for (const match of text.matchAll(/\b(day after tomorrow|tomorrow|today|in\s+\d{1,2}\s+(?:calendar\s+)?(?:days?|weeks?))\b/g)) {
    const phrase = match[0], amount = phrase.match(/\d+/)?.[0]
    const offset = phrase === 'today' ? 0 : phrase === 'tomorrow' ? 1 : phrase === 'day after tomorrow' ? 2 : Number(amount) * (phrase.includes('week') ? 7 : 1)
    const date = new Date(anchor + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + offset)
    dates.add(date.toISOString().slice(0, 10))
  }
  return [...dates]
}
