import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DataPanel,
  PageHeader,
  SectionHeading,
  StatusBadge,
  precisionSecondaryLinkClassName,
} from "@/components/precision-ui/PrecisionUI";
import precisionStyles from "@/components/precision-ui/PrecisionUI.module.css";
import { requireModule } from "@/lib/guard";
import { refreshQuoteMovementDetailAction } from "@/modules/quote-movement/actions";
import {
  formatQuoteMovementCurrency,
  formatQuoteMovementDate,
  formatQuoteMovementActivity,
  quoteMovementDisplayName,
} from "@/modules/quote-movement/presentation";
import {
  getQuoteMovementRecord,
  getQuoteMovementActivity,
  getQuoteMovementRefreshStatus,
  listQuoteMovementJobFetchOutcomes,
} from "@/modules/quote-movement/queries";
import { QuoteMovementRefreshButton } from "@/modules/quote-movement/QuoteMovementRefreshButton";
import { QuoteMovementRefreshStatus } from "@/modules/quote-movement/QuoteMovementRefreshStatus";
import type { QuoteMovementSummaryStatement } from "@rgtools/db/schema-quote-movement";

export default async function QuoteMovementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("quote-tracker");
  const { id } = await params;
  const record = await getQuoteMovementRecord(id);

  if (!record) notFound();

  const [refreshStatus, activity, fetchOutcomes] = await Promise.all([
    getQuoteMovementRefreshStatus(),
    getQuoteMovementActivity(id),
    listQuoteMovementJobFetchOutcomes(
      record.jobNumber ? [record.jobNumber] : [],
    ),
  ]);
  const refreshDetail = refreshQuoteMovementDetailAction.bind(
    null,
    record.jobNumber ?? "",
  );

  return (
    <div className="space-y-5">
      <Link href="/quote-movement" className={precisionSecondaryLinkClassName}>
        Back to Quote Movement
      </Link>
      <PageHeader
        title={quoteMovementDisplayName(record)}
        description={`Cached from ServiceM8 on ${formatQuoteMovementDate(record.lastServiceM8SyncedAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <QuoteMovementRefreshButton
              action={refreshDetail}
              refreshPending={false}
              idleLabel="Refresh this job"
              pendingLabel="Refreshing this job"
            />
            <StatusBadge tone={record.servicem8Active ? "positive" : "muted"}>
              {record.convertedAt
                ? "Converted"
                : record.servicem8Active
                  ? "Active"
                  : "Inactive"}
            </StatusBadge>
            {record.convertedAt ? (
              record.workOrderId ? (
                <Link
                  href={`/work-orders/${record.workOrderId}`}
                  className={precisionSecondaryLinkClassName}
                >
                  Open Work Order
                </Link>
              ) : (
                <span className="text-sm text-text-muted">
                  Work Order record not yet available
                </span>
              )
            ) : null}
          </div>
        }
      />

      <QuoteMovementRefreshStatus status={refreshStatus} showCount={false} />
      {fetchOutcomes[0] ? (
        <p role="status" className="text-sm text-text-secondary">
          Latest fetch:{" "}
          {formatFetchOutcome(
            fetchOutcomes[0].status,
            fetchOutcomes[0].syncedCount,
            fetchOutcomes[0].errorMessage,
          )}
        </p>
      ) : null}

      <DataPanel title="Quote summary" eyebrow="ServiceM8 source">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Customer" value={record.customerName} />
          <Field label="Address" value={record.jobAddress ?? "-"} />
          <Field
            label="Quote value excl. GST"
            value={formatQuoteMovementCurrency(record.quoteValueExcludingGst)}
            numeric
          />
          <Field label="ServiceM8 status" value={record.servicem8Status} />
        </dl>
      </DataPanel>

      <DataPanel title="What Matters Now" eyebrow="Complete source history">
        {record.importantDetailsSummary ? (
          <div className="space-y-5">
            {record.summaryLastError ? (
              <p className="rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-sm text-text-secondary">
                {record.summaryLastError}
              </p>
            ) : null}
            <SummarySection
              title="Current Position"
              statements={[record.importantDetailsSummary.currentPosition]}
            />
            <SummarySection
              title="Unresolved Matters"
              statements={record.importantDetailsSummary.unresolvedMatters}
            />
            <SummarySection
              title="Material Facts"
              statements={record.importantDetailsSummary.materialFacts}
            />
            <SummarySection
              title="Important Dates"
              statements={record.importantDetailsSummary.importantDates}
            />
            <SummarySection
              title="Participants"
              statements={record.importantDetailsSummary.participants}
            />
            <SummarySection
              title="Latest Meaningful Movement"
              statements={
                record.importantDetailsSummary.latestMeaningfulMovement
                  ? [record.importantDetailsSummary.latestMeaningfulMovement]
                  : []
              }
            />
            <SummarySection
              title="Consent State"
              statements={
                record.importantDetailsSummary.consentState
                  ? [record.importantDetailsSummary.consentState]
                  : []
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {record.summaryLastError ? (
              <p className="rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-sm text-text-secondary">
                {record.summaryLastError}
              </p>
            ) : null}
            <p className="max-w-[70ch] text-sm text-text-secondary">
              Not yet summarised. What Matters Now updates automatically after
              meaningful source activity.
            </p>
          </div>
        )}
      </DataPanel>

      <details className={precisionStyles.dataPanel}>
        <summary className={precisionStyles.collapsibleSummary}>
          <SectionHeading title="Activity" eyebrow="Retained source history" />
        </summary>
        {activity.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No retained activity yet.
          </p>
        ) : (
          <ol className="space-y-3">
            {activity.map((item) => {
              const display = formatQuoteMovementActivity(
                item.sourceType,
                item.content,
                item.interpretationSummary,
                item.safeError,
              );
              return (
                <li
                  key={item.id}
                  className="rounded-md border border-border bg-surface-subtle px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                    <span className="font-semibold uppercase">
                      {display.label}
                    </span>
                    <time dateTime={item.occurredAt?.toISOString()}>
                      {formatQuoteMovementDate(item.occurredAt)}
                    </time>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-sm text-text-primary">
                      {display.preview}
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-text-secondary">
                      {display.body}
                    </pre>
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </details>
    </div>
  );
}

function SummarySection({
  title,
  statements,
}: {
  title: string;
  statements: QuoteMovementSummaryStatement[];
}) {
  if (statements.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <ul className="space-y-3">
        {statements.map((statement, index) => (
          <li key={`${title}-${index}`} className="text-sm text-text-secondary">
            <p>{statement.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatFetchOutcome(
  status: string,
  syncedCount: number,
  errorMessage: string | null,
) {
  if (status === "failed") return errorMessage ?? "Fetch failed.";
  if (status === "queued") return "Queued.";
  if (status === "fetching" || status === "pending") return "Fetching.";
  if (syncedCount === 0) return "Not an active Quote.";
  return "Fetched.";
}

function Field({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd
        className={`mt-1 break-words text-sm font-semibold text-text-primary ${numeric ? "tabular-nums" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
