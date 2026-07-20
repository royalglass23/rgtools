export function latestQuoteMovementActivity(
  sources: Array<{ occurredAt: Date | null }>,
): Date | null {
  return sources.reduce<Date | null>((latest, source) => {
    if (!source.occurredAt) return latest;
    return !latest || source.occurredAt > latest ? source.occurredAt : latest;
  }, null);
}

export function quoteMovementSourceNoun(count: number) {
  return count === 1 ? "source" : "sources";
}
