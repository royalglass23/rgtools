import Link from "next/link";
import {
  DataPanel,
  FeedbackState,
  PageHeader,
  SectionHeading,
  StatusBadge,
  TableShell,
} from "@/components/precision-ui/PrecisionUI";
import { requireModule } from "@/lib/guard";
import { refreshQuoteMovementAction } from "@/modules/quote-movement/actions";
import {
  formatQuoteMovementCurrency,
  formatQuoteMovementDate,
} from "@/modules/quote-movement/presentation";
import {
  getQuoteMovementRefreshStatus,
  listActiveQuoteMovementRecords,
} from "@/modules/quote-movement/queries";
import { QuoteMovementRefreshButton } from "@/modules/quote-movement/QuoteMovementRefreshButton";
import { DismissibleNotice } from "@/modules/ui/DismissibleNotice";

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
  const [records, refreshStatus] = await Promise.all([
    listActiveQuoteMovementRecords(),
    getQuoteMovementRefreshStatus(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quotes"
        title="Quote Movement"
        description={`${records.length} active ServiceM8 Quote jobs shown from the RG Tools cache`}
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
          <SectionHeading title="Active quotes" eyebrow="Quote movement" />
          <StatusBadge tone="info">
            {records.length} {records.length === 1 ? "job" : "jobs"}
          </StatusBadge>
        </div>

        {records.length === 0 ? (
          <FeedbackState tone="empty">
            No active ServiceM8 Quote jobs.
          </FeedbackState>
        ) : (
          <TableShell label="Active ServiceM8 Quote jobs">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-subtle text-left text-xs font-semibold text-text-muted">
                <tr>
                  <th className="px-4 py-3">Job number</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3 text-right">
                    Quote value excl. GST
                  </th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id} className="text-text-secondary">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      <Link
                        className="text-brand underline-offset-2 hover:underline"
                        href={`/quote-movement/${record.id}`}
                      >
                        {record.jobNumber ?? "Open quote"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {record.customerName}
                    </td>
                    <td className="px-4 py-3">{record.jobAddress ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {formatQuoteMovementCurrency(
                        record.quoteValueExcludingGst,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={record.servicem8Active ? "positive" : "muted"}
                      >
                        {record.servicem8Active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                      {formatQuoteMovementDate(record.lastServiceM8SyncedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )}
      </section>
    </div>
  );
}
