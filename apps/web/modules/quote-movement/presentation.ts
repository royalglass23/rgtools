export function formatQuoteMovementCurrency(value: string | null) {
  if (value === null) return '-'
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'

  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(number)
}

export function formatQuoteMovementDate(value: Date | null) {
  if (!value) return 'Never'

  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

export function quoteMovementDisplayName({
  jobNumber,
  customerName,
}: {
  jobNumber: string | null
  customerName: string | null
}) {
  return jobNumber ?? customerName ?? 'Quote Movement'
}
