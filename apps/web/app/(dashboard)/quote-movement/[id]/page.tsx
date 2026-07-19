import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DataPanel,
  PageHeader,
  StatusBadge,
  precisionSecondaryLinkClassName,
} from "@/components/precision-ui/PrecisionUI";
import { requireModule } from "@/lib/guard";
import {
  formatQuoteMovementCurrency,
  formatQuoteMovementDate,
  quoteMovementDisplayName,
} from "@/modules/quote-movement/presentation";
import { getQuoteMovementRecord } from "@/modules/quote-movement/queries";

export default async function QuoteMovementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("quote-tracker");
  const { id } = await params;
  const record = await getQuoteMovementRecord(id);

  if (!record) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quote movement detail"
        title={quoteMovementDisplayName(record)}
        description={`Cached from ServiceM8 on ${formatQuoteMovementDate(record.lastServiceM8SyncedAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={record.servicem8Active ? "positive" : "muted"}>
              {record.servicem8Active ? "Active" : "Inactive"}
            </StatusBadge>
            <Link
              href="/quote-movement"
              className={precisionSecondaryLinkClassName}
            >
              Back to Quote Movement
            </Link>
          </div>
        }
      />

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

      <DataPanel title="What Matters Now" eyebrow="Next slices">
        <p className="max-w-[70ch] text-sm text-text-secondary">
          Conversion history, quote summaries, complexity, and follow-up timing
          land here in the next Quote Movement slices.
        </p>
      </DataPanel>
    </div>
  );
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
