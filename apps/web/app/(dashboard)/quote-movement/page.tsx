import {
  DataPanel,
  PageHeader,
  SectionHeading,
} from "@/components/precision-ui/PrecisionUI";
import { requireModule } from "@/lib/guard";
import {
  refreshQuoteMovementAction,
  updateQuoteMovementComplexityAction,
} from "@/modules/quote-movement/actions";
import { formatQuoteMovementDate } from "@/modules/quote-movement/presentation";
import {
  getQuoteMovementRefreshStatus,
  listQuoteMovementRecords,
} from "@/modules/quote-movement/queries";
import { QuoteMovementList } from "@/modules/quote-movement/QuoteMovementList";
import { QuoteMovementRefreshButton } from "@/modules/quote-movement/QuoteMovementRefreshButton";
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
  const [records, refreshStatus] = await Promise.all([
    listQuoteMovementRecords({
      search,
      projectComplexity:
        projectComplexity === "all" ? undefined : projectComplexity,
      lifecycle,
      sort,
    }),
    getQuoteMovementRefreshStatus(),
  ]);

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
          <form action={refreshQuoteMovementAction}>
            <QuoteMovementRefreshButton />
          </form>
        }
      />

      <DataPanel title="Refresh status" eyebrow="ServiceM8 cache">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-text-muted">
              Last refreshed
            </dt>
            <dd className="mt-1 text-sm font-semibold text-text-primary">
              {formatQuoteMovementDate(refreshStatus.lastSuccessfulAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-text-muted">
              Cached active jobs
            </dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-text-primary">
              {refreshStatus.lastSuccessfulCount}
            </dd>
          </div>
        </dl>
      </DataPanel>

      {refreshStatus.latestFailure && (
        <DismissibleNotice
          tone="error"
          noticeKey={`${refreshStatus.latestFailure.at.toISOString()}-${refreshStatus.latestFailure.message}`}
        >
          Quote Movement could not refresh from ServiceM8:{" "}
          {refreshStatus.latestFailure.message}
        </DismissibleNotice>
      )}

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
