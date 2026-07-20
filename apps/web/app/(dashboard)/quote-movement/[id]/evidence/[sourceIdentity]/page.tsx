import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DataPanel,
  PageHeader,
  precisionSecondaryLinkClassName,
} from "@/components/precision-ui/PrecisionUI";
import { requireModule } from "@/lib/guard";
import { formatQuoteMovementDate } from "@/modules/quote-movement/presentation";
import { getQuoteMovementEvidence } from "@/modules/quote-movement/queries";

export default async function QuoteMovementEvidencePage({
  params,
}: {
  params: Promise<{ id: string; sourceIdentity: string }>;
}) {
  await requireModule("quote-tracker");
  const { id, sourceIdentity } = await params;
  const evidence = await getQuoteMovementEvidence(id, sourceIdentity);
  if (!evidence) notFound();
  const content = evidenceContent(evidence.content);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quote Movement"
        title="Supporting evidence"
        description={`${evidence.jobNumber ?? "Quote"} · ${evidence.customerName}`}
        actions={
          <Link
            href={`/quote-movement/${evidence.recordId}`}
            className={precisionSecondaryLinkClassName}
          >
            Back to What Matters Now
          </Link>
        }
      />

      <DataPanel
        title={sourceTypeLabel(evidence.sourceType)}
        eyebrow="Retained source"
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-text-muted">Occurred</dt>
            <dd className="mt-1 text-sm text-text-primary">
              {formatQuoteMovementDate(evidence.occurredAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-text-muted">
              Interpretation
            </dt>
            <dd className="mt-1 text-sm text-text-primary">
              {interpretationLabel(evidence.interpretationStatus)}
            </dd>
          </div>
        </dl>
        <div className="mt-5 space-y-3">
          {content.map((entry) => (
            <p
              key={entry}
              className="whitespace-pre-wrap text-sm text-text-secondary"
            >
              {entry}
            </p>
          ))}
          {evidence.interpretationSummary ? (
            <p className="text-sm text-text-secondary">
              {evidence.interpretationSummary}
            </p>
          ) : null}
          {content.length === 0 && !evidence.interpretationSummary ? (
            <p className="text-sm text-text-muted">
              This retained source has no readable text presentation.
            </p>
          ) : null}
        </div>
      </DataPanel>
    </div>
  );
}

function evidenceContent(content: Record<string, unknown>) {
  return [
    content.subject,
    content.text,
    content.body,
    content.name,
    content.eventType,
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
}

function sourceTypeLabel(sourceType: string) {
  const labels: Record<string, string> = {
    note: "ServiceM8 note",
    email: "ServiceM8 email",
    file: "ServiceM8 file",
    photo: "ServiceM8 photo",
    quote_change: "ServiceM8 quote change",
    tracked_open: "Tracked customer open",
    tracked_download: "Tracked customer download",
  };
  return labels[sourceType] ?? "Retained source";
}

function interpretationLabel(status: string | null) {
  if (status === "interpreted") return "Read successfully";
  if (status === "unsupported") return "Unsupported source";
  return "Could not be interpreted";
}
