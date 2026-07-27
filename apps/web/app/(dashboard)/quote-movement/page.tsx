import { PageHeader, SectionHeading } from "@/components/precision-ui/PrecisionUI";
import { requireModule } from "@/lib/guard";
import {
  refreshQuoteMovementJobAction,
  updateQuoteMovementComplexityAction,
} from "@/modules/quote-movement/actions";
import {
  getQuoteMovementRefreshStatus,
  listQuoteMovementJobFetchOutcomes,
  listQuoteMovementRecords,
} from "@/modules/quote-movement/queries";
import { QuoteMovementList } from "@/modules/quote-movement/QuoteMovementList";
import { QuoteMovementRefreshStatus } from "@/modules/quote-movement/QuoteMovementRefreshStatus";
import { DismissibleNotice } from "@/modules/ui/DismissibleNotice";
import type { QuoteMovementProjectComplexity } from "@rgtools/db/schema-quote-movement";

const PROJECT_COMPLEXITIES: QuoteMovementProjectComplexity[] = [
  "unassessed",
  "easy",
  "normal",
  "tight",
  "very_difficult",
];

export default async function QuoteMovementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("quote-tracker");
  const resolvedSearchParams = await searchParams;
  const refreshError =
    typeof resolvedSearchParams.refreshError === "string"
      ? resolvedSearchParams.refreshError
      : null;
  const search = stringParam(resolvedSearchParams.search);
  const requestedComplexity = stringParam(
    resolvedSearchParams.projectComplexity,
  );
  const projectComplexity = PROJECT_COMPLEXITIES.includes(
    requestedComplexity as QuoteMovementProjectComplexity,
  )
    ? (requestedComplexity as QuoteMovementProjectComplexity)
    : "all";
  const lifecycle = stringParam(resolvedSearchParams.lifecycle) === "converted"
    ? "converted"
    : "active";
  const requestedSort = stringParam(resolvedSearchParams.sort);
  const sort = requestedSort === "quote_value" || requestedSort === "customer"
    ? requestedSort
    : "latest_activity";
  const [records, refreshStatus, fetchOutcomes] = await Promise.all([
    listQuoteMovementRecords({
      search,
      projectComplexity:
        projectComplexity === "all" ? undefined : projectComplexity,
      lifecycle,
      sort,
    }),
    getQuoteMovementRefreshStatus(),
    listQuoteMovementJobFetchOutcomes(),
  ]);
  const visibleFetchOutcomes = fetchOutcomes.filter(
    (outcome) => outcome.status !== "fetched",
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quotes"
        title="Quote Movement"
        description={
          lifecycle === "active"
            ? `${records.length} active ServiceM8 Quote jobs shown from the RG Tools cache`
            : `${records.length} inactive cached Quote jobs shown as the transitional Converted view`
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <form action={refreshQuoteMovementJobAction} className="flex items-center gap-2">
              <label className="sr-only" htmlFor="quote-movement-job-number">
                Job number to fetch
              </label>
              <input
                aria-label="Job number to fetch"
                className="w-40 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                id="quote-movement-job-number"
                name="jobNumber"
                placeholder="Q260101; Q260102"
                type="search"
              />
              <button
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-primary"
                type="submit"
              >
                Fetch jobs
              </button>
            </form>
            {visibleFetchOutcomes.length > 0 ? (
              <ul aria-label="Job fetch outcomes" className="w-full text-xs text-text-muted">
                {visibleFetchOutcomes.map((outcome) => (
                  <li key={`${outcome.jobNumber}-${outcome.createdAt.toISOString()}`}>
                    <span className="font-semibold">{outcome.jobNumber}</span>: {formatFetchOutcome(outcome.status, outcome.syncedCount, outcome.errorMessage)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        }
      />

      <QuoteMovementRefreshStatus status={refreshStatus} />

      {refreshError && !refreshStatus.latestFailure && (
        <DismissibleNotice tone="error" noticeKey={refreshError}>
          Quote Movement could not refresh from ServiceM8: {refreshError}
        </DismissibleNotice>
      )}

      <section className="space-y-3" aria-label="Active quotes">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeading
            title={lifecycle === "active" ? "Active quotes" : "Converted quotes"}
            eyebrow="Quote movement"
          />
          <span className="text-sm text-text-muted">
            {records.length} {records.length === 1 ? "job" : "jobs"}
          </span>
        </div>

        <QuoteMovementList
          records={records}
          selectedControls={{
            search,
            projectComplexity,
            lifecycle,
            sort,
          }}
          updateComplexityAction={updateQuoteMovementComplexityAction}
        />
      </section>
    </div>
  );
}

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function formatFetchOutcome(status: string, syncedCount: number, errorMessage: string | null) {
  if (status === "failed") return errorMessage ?? "Fetch failed.";
  if (status === "queued") return "Queued.";
  if (status === "fetching" || status === "pending") return "Fetching.";
  if (syncedCount === 0) return "Not an active Quote.";
  return "Fetched.";
}
