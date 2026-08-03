import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  quoteMovementRecords,
  quoteMovementSourceEnrichment,
  quoteMovementSources,
} from "@rgtools/db/schema-quote-movement";
import type { QuoteMovementPersistenceTransaction } from "./repository";
import type {
  QuoteMovementInterpretationStatus,
  QuoteMovementSourceInput,
  QuoteMovementSourceCoverage,
} from "./sync";
import type {
  QuoteMovementSavedSummary,
  QuoteMovementSummaryRepository,
} from "./summary";

type QuoteMovementSummaryExecutor =
  | typeof db
  | QuoteMovementPersistenceTransaction;

export const quoteMovementSummaryRepository: QuoteMovementSummaryRepository = {
  listPendingSummaries(servicem8JobUuids, options) {
    return listPendingQuoteMovementSummaries(servicem8JobUuids, db, options);
  },
  saveValidSummary(summary) {
    return saveValidQuoteMovementSummary(summary);
  },
  recordSummaryFailure(recordId, message, attemptedAt) {
    return recordQuoteMovementSummaryFailure(recordId, message, attemptedAt);
  },
};

export async function listPendingQuoteMovementSummaries(
  servicem8JobUuids: string[],
  executor: QuoteMovementSummaryExecutor = db,
  options: { force?: boolean } = {},
) {
  if (servicem8JobUuids.length === 0) return [];
  const records = await executor
    .select()
    .from(quoteMovementRecords)
    .where(inArray(quoteMovementRecords.servicem8JobUuid, servicem8JobUuids));
  if (records.length === 0) return [];
  const recordIds = records.map((record) => record.id);
  const sourceRows = await executor
    .select({
      recordId: quoteMovementSources.quoteMovementRecordId,
      sourceType: quoteMovementSources.sourceType,
      sourceIdentity: quoteMovementSources.sourceIdentity,
      occurredAt: quoteMovementSources.occurredAt,
      content: quoteMovementSources.content,
      interpretationStatus: quoteMovementSourceEnrichment.interpretationStatus,
      summary: quoteMovementSourceEnrichment.summary,
      safeError: quoteMovementSourceEnrichment.safeError,
    })
    .from(quoteMovementSources)
    .leftJoin(
      quoteMovementSourceEnrichment,
      eq(quoteMovementSourceEnrichment.sourceId, quoteMovementSources.id),
    )
    .where(inArray(quoteMovementSources.quoteMovementRecordId, recordIds));
  const sourcesByRecordId = new Map<string, QuoteMovementSourceInput[]>();
  for (const source of sourceRows) {
    const sources = sourcesByRecordId.get(source.recordId) ?? [];
    sources.push({
      sourceType: sourceType(source.sourceType),
      sourceIdentity: source.sourceIdentity,
      occurredAt: source.occurredAt,
      content: source.content,
      enrichment: {
        interpretationStatus: interpretationStatus(source.interpretationStatus),
        summary: source.summary,
        safeError: source.safeError,
      },
    });
    sourcesByRecordId.set(source.recordId, sources);
  }

  return records.flatMap((record) => {
    const sources = (sourcesByRecordId.get(record.id) ?? []).sort(
      (left, right) => left.sourceIdentity.localeCompare(right.sourceIdentity),
    );
    const sourceCoverage = coverageFromRecord(record);
    const candidateRecord = {
      servicem8JobUuid: record.servicem8JobUuid,
      servicem8CompanyUuid: record.servicem8CompanyUuid,
      servicem8Status: record.servicem8Status,
      jobNumber: record.jobNumber,
      customerName: record.customerName,
      jobAddress: record.jobAddress,
      quoteValueExcludingGst: record.quoteValueExcludingGst,
      sourceUpdatedAt: record.sourceUpdatedAt,
      latestActivityAt: record.latestActivityAt,
      sourceCoverage,
      sources,
      lastServiceM8SyncedAt: record.lastServiceM8SyncedAt,
    };
    const sourceFingerprint = fingerprintForSummary(candidateRecord);
    if (
      !options.force &&
      record.importantDetailsSummary &&
      record.summarySourceFingerprint === sourceFingerprint
    ) {
      return [];
    }
    return [
      {
        recordId: record.id,
        sourceFingerprint,
        hasValidSummary: Boolean(record.importantDetailsSummary),
        record: candidateRecord,
      },
    ];
  });
}

export async function saveValidQuoteMovementSummary(
  saved: QuoteMovementSavedSummary,
  executor: QuoteMovementSummaryExecutor = db,
) {
  await executor
    .update(quoteMovementRecords)
    .set({
      importantDetailsSummary: saved.summary,
      summarySourceFingerprint: saved.sourceFingerprint,
      summaryGeneratedAt: saved.generatedAt,
      summaryLastAttemptedAt: saved.generatedAt,
      summaryLastError: null,
      updatedAt: saved.generatedAt,
    })
    .where(eq(quoteMovementRecords.id, saved.recordId));
}

export async function recordQuoteMovementSummaryFailure(
  recordId: string,
  message: string,
  attemptedAt: Date,
  executor: QuoteMovementSummaryExecutor = db,
) {
  await executor
    .update(quoteMovementRecords)
    .set({
      summaryLastAttemptedAt: attemptedAt,
      summaryLastError: message,
      updatedAt: attemptedAt,
    })
    .where(eq(quoteMovementRecords.id, recordId));
}

function coverageFromRecord(record: typeof quoteMovementRecords.$inferSelect) {
  return {
    status:
      record.sourceCoverage === "complete"
        ? ("complete" as const)
        : ("incomplete" as const),
    discoveredCount: record.sourceDiscoveredCount,
    unreadCount: record.sourceUnreadCount,
    unsupportedCount: record.sourceUnsupportedCount,
    failedCount: record.sourceFailedCount,
    accessFailureCount: 0,
    unretainedSourceCount: 0,
    details: record.sourceCoverageDetails,
  } satisfies QuoteMovementSourceCoverage;
}

function fingerprintForSummary(input: {
  servicem8JobUuid: string;
  servicem8Status: string;
  jobNumber: string | null;
  customerName: string;
  jobAddress: string | null;
  quoteValueExcludingGst: string | null;
  sourceUpdatedAt: Date | null;
  latestActivityAt: Date | null;
  sourceCoverage: QuoteMovementSourceCoverage;
  sources: QuoteMovementSourceInput[];
}) {
  const meaningfulInput = {
    servicem8JobUuid: input.servicem8JobUuid,
    servicem8Status: input.servicem8Status,
    jobNumber: input.jobNumber,
    customerName: input.customerName,
    jobAddress: input.jobAddress,
    quoteValueExcludingGst: input.quoteValueExcludingGst,
    sourceUpdatedAt: input.sourceUpdatedAt?.toISOString() ?? null,
    latestActivityAt: input.latestActivityAt?.toISOString() ?? null,
    sourceCoverage: input.sourceCoverage,
    sources: input.sources.map((source) => ({
      ...source,
      occurredAt: source.occurredAt?.toISOString() ?? null,
    })),
  };
  return createHash("sha256").update(stableJson(meaningfulInput)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sourceType(value: string): QuoteMovementSourceInput["sourceType"] {
  if (
    value === "note" ||
    value === "email" ||
    value === "file" ||
    value === "photo" ||
    value === "quote_change" ||
    value === "tracked_open" ||
    value === "tracked_download"
  ) {
    return value;
  }
  throw new Error("Retained Quote Movement source type is invalid.");
}

function interpretationStatus(
  value: string | null,
): QuoteMovementInterpretationStatus {
  if (
    value === "interpreted" ||
    value === "unsupported" ||
    value === "failed"
  ) {
    return value;
  }
  return "failed";
}
