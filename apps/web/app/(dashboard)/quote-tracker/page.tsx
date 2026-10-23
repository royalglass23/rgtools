import { requireModule } from "@/lib/guard";
import Link from "next/link";
import { listQuotes } from "@/modules/quote-tracker/queries";
import { parseQuoteListFilters } from "@/modules/quote-tracker/list-filters";
import { QuoteTableControls } from "@/modules/quote-tracker/QuoteTableControls";
import { StatusBadge } from "@/modules/quote-tracker/presentation";
import {
  STATUS_TAG_RULES,
  type StatusTag,
} from "@/modules/quote-tracker/score";
import { TrackQuoteButton } from "@/modules/quote-tracker/TrackQuoteButton";
import { createTrackedQuoteAction } from "@/modules/quote-tracker/actions";
import { PageHeader } from "@/components/precision-ui/PrecisionUI";

export default async function QuoteTrackerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("quote-tracker");
  const filters = parseQuoteListFilters(await searchParams);
  const { rows, total, pageCount } = await listQuotes(filters);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quote Tracker"
        description="Track ServiceM8 quotes, engagement, expiry, and follow-up status."
        actions={<TrackQuoteButton action={createTrackedQuoteAction} />}
      />

      <Link href={`/quote-tracker/overview?trackedIn=${filters.trackedIn}`} className="inline-block text-sm font-semibold underline underline-offset-4">
        Back to Quotes overview
      </Link>

      <QuoteTableControls
        filters={filters}
        rows={rows}
        total={total}
        pageCount={pageCount}
      />

      <details className="rounded border border-gray-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-950">
          How status is computed
        </summary>
        <div className="border-t border-gray-100 p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {(["hot", "warm", "cold", "dead"] as StatusTag[]).map((tag) => (
              <div key={tag}>
                <dt>
                  <StatusBadge tag={tag} />
                </dt>
                <dd className="mt-2 text-gray-600">{STATUS_TAG_RULES[tag]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-gray-500">
            Manual overrides win over computed status.
          </p>
        </div>
      </details>
    </div>
  );
}
