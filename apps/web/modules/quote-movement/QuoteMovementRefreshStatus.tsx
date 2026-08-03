import { DataPanel } from "@/components/precision-ui/PrecisionUI";
import { DismissibleNotice } from "@/modules/ui/DismissibleNotice";
import { formatQuoteMovementDate } from "./presentation";
import type { QuoteMovementRefreshStatusValue } from "./refresh-status";

export function QuoteMovementRefreshStatus({
  status,
  showCount = true,
}: {
  status: QuoteMovementRefreshStatusValue;
  showCount?: boolean;
}) {
  return (
    <div className="space-y-3">
      <DataPanel title="Refresh status" eyebrow="ServiceM8 cache">
        <dl className={`grid gap-4 ${showCount ? "sm:grid-cols-2" : ""}`}>
          <div>
            <dt className="text-xs font-medium text-text-muted">
              Last refreshed
            </dt>
            <dd className="mt-1 text-sm font-semibold text-text-primary">
              {formatQuoteMovementDate(status.lastSuccessfulAt)}
            </dd>
          </div>
          {showCount ? (
            <div>
              <dt className="text-xs font-medium text-text-muted">
                Cached active jobs
              </dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
                {status.lastSuccessfulCount}
              </dd>
            </div>
          ) : null}
        </dl>
      </DataPanel>

      {status.isPending ? (
        <p
          role="status"
          className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary"
        >
          Refresh is running. Cached quotes remain available while ServiceM8
          sources and What Matters Now update.
        </p>
      ) : status.isStale ? (
        <DismissibleNotice
          tone="warning"
          noticeKey={`quote-movement-stale-${status.lastSuccessfulAt?.toISOString() ?? "never"}`}
          dismissalStorageKey="quote-movement-stale"
        >
          Cached data may be out of date. The last valid quotes remain available
          while refresh retries.
        </DismissibleNotice>
      ) : null}

      {status.latestFailure ? (
        <DismissibleNotice
          tone="error"
          noticeKey={`${status.latestFailure.at.toISOString()}-${status.latestFailure.message}`}
          dismissalStorageKey="quote-movement-refresh-error"
        >
          Latest refresh could not complete. The previous cached data was kept.{" "}
          {status.latestFailure.message}
        </DismissibleNotice>
      ) : null}
    </div>
  );
}
