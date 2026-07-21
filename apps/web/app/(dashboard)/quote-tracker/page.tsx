import { requireModule } from "@/lib/guard";
import { listQuotes } from "@/modules/quote-tracker/queries";
import { parseQuoteListFilters } from "@/modules/quote-tracker/list-filters";
import { QuoteTableControls } from "@/modules/quote-tracker/QuoteTableControls";
import {
  StatusBadge,
  formatCurrency,
} from "@/modules/quote-tracker/presentation";
import {
  STATUS_TAG_RULES,
  type StatusTag,
} from "@/modules/quote-tracker/score";
import { TrackQuoteButton } from "@/modules/quote-tracker/TrackQuoteButton";
import { createTrackedQuoteAction } from "@/modules/quote-tracker/actions";
import {
  KpiCard as PrecisionKpiCard,
  PageHeader,
} from "@/components/precision-ui/PrecisionUI";

export default async function QuoteTrackerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("quote-tracker");
  const filters = parseQuoteListFilters(await searchParams);
  const { rows, total, pageCount, kpis } = await listQuotes(filters);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quote Tracker"
        description="Track ServiceM8 quotes, engagement, expiry, and follow-up status."
        actions={<TrackQuoteButton action={createTrackedQuoteAction} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Total value"
          value={formatCurrency(kpis.totalValue)}
          tone="green"
        />
        <KpiCard label="Hot quotes" value={String(kpis.hotCount)} tone="red" />
        <KpiCard
          label="Warm quotes"
          value={String(kpis.warmCount)}
          tone="amber"
        />
        <KpiCard
          label="Cold quotes"
          value={String(kpis.coldCount)}
          tone="blue"
        />
        <KpiCard
          label="Dead quotes"
          value={String(kpis.deadCount)}
          tone="gray"
        />
        <KpiCard
          label="Forwarding flags"
          value={String(kpis.forwardingCount)}
          tone="amber"
        />
      </div>

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

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "red" | "green" | "slate" | "amber" | "gray";
}) {
  return (
    <PrecisionKpiCard label={label} value={value} marker={toneMarker[tone]} />
  );
}

const toneMarker = {
  blue: "C",
  red: "H",
  green: "$",
  slate: "S",
  amber: "W",
  gray: "D",
} as const;
