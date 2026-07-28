"use client";

import { useState, useTransition } from "react";

export function QuoteMovementSummaryRecovery({
  recordId,
  error,
  retryAction,
}: {
  recordId: string;
  error: string;
  retryAction: (recordId: string) => Promise<unknown>;
}) {
  const [isPending, startTransition] = useTransition();
  const [retryError, setRetryError] = useState<string | null>(null);

  return (
    <div className="rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-sm text-text-secondary">
      <p>{error}</p>
      {retryError ? <p className="mt-1 text-warning-text">{retryError}</p> : null}
      <button
        type="button"
        className="mt-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text-primary"
        disabled={isPending}
        onClick={() => {
          setRetryError(null);
          startTransition(async () => {
            try {
              await retryAction(recordId);
            } catch (caught) {
              setRetryError(caught instanceof Error ? caught.message : "Retry failed.");
            }
          });
        }}
      >
        {isPending ? "Retrying summary" : "Retry summary"}
      </button>
    </div>
  );
}
