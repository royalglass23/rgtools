import { QUOTE_MOVEMENT_REFRESH_WINDOW_MS } from "./refresh-policy";

export type QuoteMovementRefreshStatusValue = {
  lastSuccessfulAt: Date | null;
  lastSuccessfulCount: number;
  pendingSince: Date | null;
  isPending: boolean;
  isStale: boolean;
  latestFailure: { at: Date; message: string } | null;
};

export function deriveQuoteMovementRefreshStatus({
  successful,
  failed,
  pending,
  now,
}: {
  successful: {
    createdAt: Date;
    completedAt: Date | null;
    syncedCount: number;
  } | null;
  failed: {
    createdAt: Date;
    completedAt: Date | null;
    errorMessage: string | null;
  } | null;
  pending: { createdAt: Date } | null;
  now: Date;
}): QuoteMovementRefreshStatusValue {
  const pendingAgeMs = pending
    ? now.getTime() - pending.createdAt.getTime()
    : null
  const pendingSince =
    pending && (pendingAgeMs ?? 0) < QUOTE_MOVEMENT_REFRESH_WINDOW_MS
      ? pending.createdAt
      : null
  const lastSuccessfulAt = successful
    ? successful.completedAt ?? successful.createdAt
    : null;
  const latestFailureAt = failed
    ? failed.completedAt ?? failed.createdAt
    : null;
  const hasNewerFailure =
    latestFailureAt !== null &&
    (lastSuccessfulAt === null ||
      latestFailureAt.getTime() > lastSuccessfulAt.getTime());

  return {
    lastSuccessfulAt,
    lastSuccessfulCount: successful?.syncedCount ?? 0,
    pendingSince,
    isPending: pendingSince !== null,
    isStale:
      lastSuccessfulAt === null ||
      now.getTime() - lastSuccessfulAt.getTime() >=
        QUOTE_MOVEMENT_REFRESH_WINDOW_MS,
    latestFailure: hasNewerFailure
      ? {
          at: latestFailureAt,
          message: failed?.errorMessage ?? "Quote Movement refresh failed.",
        }
      : null,
  };
}
