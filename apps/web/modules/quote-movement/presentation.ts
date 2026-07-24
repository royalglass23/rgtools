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

export function formatQuoteMovementActivity(
  sourceType: string,
  content: Record<string, unknown>,
  summary: string | null,
  safeError: string | null,
) {
  if (sourceType === "tracked_open") {
    return {
      label: "Tracked customer open",
      preview: "Customer opened the tracked quote.",
      body: "Customer opened the tracked quote.",
    };
  }
  if (sourceType === "tracked_download") {
    return {
      label: "Tracked customer download",
      preview: "Customer downloaded the tracked quote.",
      body: "Customer downloaded the tracked quote.",
    };
  }
  const readable = summary ?? String(
    content.subject ?? content.text ?? content.body ?? content.name ?? safeError ?? "Activity",
  );
  return {
    label: sourceType.replaceAll("_", " "),
    preview: readable,
    body: summary ?? String(content.body ?? content.text ?? content.subject ?? content.name ?? safeError ?? "No readable content."),
  };
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
