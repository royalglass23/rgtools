import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  quoteMovementRecords,
  quoteMovementRefreshRuns,
  quoteMovementSourceEnrichment,
  quoteMovementSources,
} from "@rgtools/db/schema-quote-movement";
import type { QuoteMovementProjectComplexity } from "@rgtools/db/schema-quote-movement";
import type {
  QuoteMovementSnapshotInput,
  QuoteMovementSnapshotRepository,
  QuoteMovementInterpretationStatus,
  QuoteMovementRefreshContext,
  QuoteMovementSourceCoverage,
} from "./sync";
import {
  latestQuoteMovementActivity,
  quoteMovementSourceNoun,
} from "./source-history";

export type QuoteMovementPersistenceTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

type QuoteMovementRefreshExecutor =
  | typeof db
  | QuoteMovementPersistenceTransaction;

type QuoteMovementRefreshOutcome =
  | { status: "success"; syncedCount: number }
  | { status: "failed"; errorMessage: string };

export const quoteMovementSnapshotRepository: QuoteMovementSnapshotRepository =
  {
    async replaceActiveSnapshot(records, context) {
      await db.transaction((tx) =>
        persistQuoteMovementSnapshot(tx, records, context),
      );
    },

    async recordFailure(message, context) {
      await persistQuoteMovementRefreshOutcome(db, context, {
        status: "failed",
        errorMessage: message,
      });
    },
  };

export async function updateQuoteMovementProjectComplexity(
  recordId: string,
  projectComplexity: QuoteMovementProjectComplexity,
) {
  await db
    .update(quoteMovementRecords)
    .set({ projectComplexity, updatedAt: new Date() })
    .where(eq(quoteMovementRecords.id, recordId));
}

export async function persistQuoteMovementSnapshot(
  tx: QuoteMovementPersistenceTransaction,
  records: QuoteMovementSnapshotInput[],
  context: QuoteMovementRefreshContext,
) {
  const activeJobUuids = records.map((record) => record.servicem8JobUuid);
  const activeJobUuidSet = new Set(activeJobUuids);
  const convertedJobUuids = Array.from(new Set(
    (context.convertedJobUuids ?? []).filter(
      (jobUuid) => !activeJobUuidSet.has(jobUuid),
    ),
  ));
  const seenJobUuids = [...activeJobUuids, ...convertedJobUuids];

  for (const record of records) {
    const [savedRecord] = await tx
      .insert(quoteMovementRecords)
      .values(quoteRecordValues(record, context.refreshedAt))
      .onConflictDoUpdate({
        target: quoteMovementRecords.servicem8JobUuid,
        set: quoteRecordUpdateValues(record, context.refreshedAt),
      })
      .returning({ id: quoteMovementRecords.id });

    if (!savedRecord) throw new Error("Quote Movement record was not saved.");

    await persistQuoteMovementSources(
      tx,
      savedRecord.id,
      record.sources,
      context.refreshedAt,
    );

    const retainedSources = await tx
      .select({
        occurredAt: quoteMovementSources.occurredAt,
        interpretationStatus:
          quoteMovementSourceEnrichment.interpretationStatus,
      })
      .from(quoteMovementSources)
      .leftJoin(
        quoteMovementSourceEnrichment,
        eq(quoteMovementSourceEnrichment.sourceId, quoteMovementSources.id),
      )
      .where(eq(quoteMovementSources.quoteMovementRecordId, savedRecord.id));
    const retained = retainedSourceState(
      retainedSources.map((source) => ({
        occurredAt: source.occurredAt,
        interpretationStatus: interpretationStatus(source.interpretationStatus),
      })),
      record.sourceCoverage,
    );

    await tx
      .update(quoteMovementRecords)
      .set({
        latestActivityAt: retained.latestActivityAt,
        sourceCoverage: retained.coverage.status,
        sourceDiscoveredCount: retained.coverage.discoveredCount,
        sourceUnreadCount: retained.coverage.unreadCount,
        sourceUnsupportedCount: retained.coverage.unsupportedCount,
        sourceFailedCount: retained.coverage.failedCount,
        sourceCoverageDetails: retained.coverage.details,
      })
      .where(eq(quoteMovementRecords.id, savedRecord.id));
  }

  if (!context.partial && convertedJobUuids.length > 0) {
    await tx
      .update(quoteMovementRecords)
      .set({
        servicem8Status: "Work Order",
        servicem8Active: true,
        convertedAt: sql`coalesce(${quoteMovementRecords.convertedAt}, ${context.refreshedAt})`,
        updatedAt: context.refreshedAt,
      })
      .where(inArray(
        quoteMovementRecords.servicem8JobUuid,
        convertedJobUuids,
      ));
  }

  if (!context.partial) {
    await tx
      .update(quoteMovementRecords)
      .set({ servicem8Active: false, updatedAt: context.refreshedAt })
      .where(
        seenJobUuids.length > 0
          ? notInArray(quoteMovementRecords.servicem8JobUuid, seenJobUuids)
          : undefined,
      )
  }

  await persistQuoteMovementRefreshOutcome(tx, context, {
    status: "success",
    syncedCount: records.length,
  });
}

async function persistQuoteMovementRefreshOutcome(
  executor: QuoteMovementRefreshExecutor,
  context: QuoteMovementRefreshContext,
  outcome: QuoteMovementRefreshOutcome,
) {
  const values = outcome.status === "success"
    ? {
        status: outcome.status,
        syncedCount: outcome.syncedCount,
        errorMessage: null,
      }
    : {
        status: outcome.status,
        syncedCount: 0,
        errorMessage: outcome.errorMessage,
      };

  if (context.runId) {
    await executor
      .update(quoteMovementRefreshRuns)
      .set({ ...values, completedAt: context.refreshedAt })
      .where(and(
        eq(quoteMovementRefreshRuns.id, context.runId),
        eq(quoteMovementRefreshRuns.status, "pending"),
      ));
    return;
  }

  await executor.insert(quoteMovementRefreshRuns).values({
    ...values,
    actorId: context.actorId,
    createdAt: context.refreshedAt,
    completedAt: context.refreshedAt,
  });
}

export async function persistQuoteMovementSources(
  tx: QuoteMovementPersistenceTransaction,
  quoteMovementRecordId: string,
  sources: QuoteMovementSnapshotInput["sources"],
  refreshedAt: Date,
) {
  for (const source of sources) {
    const [savedSource] = await tx
      .insert(quoteMovementSources)
      .values({
        quoteMovementRecordId,
        sourceType: source.sourceType,
        sourceIdentity: source.sourceIdentity,
        occurredAt: source.occurredAt,
        content: source.content,
        firstDiscoveredAt: refreshedAt,
        lastSeenAt: refreshedAt,
        createdAt: refreshedAt,
        updatedAt: refreshedAt,
      })
      .onConflictDoUpdate({
        target: [
          quoteMovementSources.quoteMovementRecordId,
          quoteMovementSources.sourceIdentity,
        ],
        set: {
          sourceType: source.sourceType,
          occurredAt: source.occurredAt,
          content: source.content,
          lastSeenAt: refreshedAt,
          updatedAt: refreshedAt,
        },
      })
      .returning({ id: quoteMovementSources.id });

    if (!savedSource) throw new Error("Quote Movement source was not saved.");

    await tx
      .insert(quoteMovementSourceEnrichment)
      .values({
        sourceId: savedSource.id,
        interpretationStatus: source.enrichment.interpretationStatus,
        summary: source.enrichment.summary,
        safeError: source.enrichment.safeError,
        createdAt: refreshedAt,
        updatedAt: refreshedAt,
      })
      .onConflictDoUpdate({
        target: quoteMovementSourceEnrichment.sourceId,
        set: {
          interpretationStatus: source.enrichment.interpretationStatus,
          summary: source.enrichment.summary,
          safeError: source.enrichment.safeError,
          updatedAt: refreshedAt,
        },
      });
  }
}

function quoteRecordValues(
  record: QuoteMovementSnapshotInput,
  refreshedAt: Date,
) {
  return {
    servicem8JobUuid: record.servicem8JobUuid,
    servicem8CompanyUuid: record.servicem8CompanyUuid,
    servicem8Status: record.servicem8Status,
    servicem8Active: true,
    jobNumber: record.jobNumber,
    customerName: record.customerName,
    jobAddress: record.jobAddress,
    quoteValueExcludingGst: record.quoteValueExcludingGst,
    sourceUpdatedAt: record.sourceUpdatedAt,
    latestActivityAt: record.latestActivityAt,
    convertedAt: null,
    sourceCoverage: record.sourceCoverage.status,
    sourceDiscoveredCount: record.sourceCoverage.discoveredCount,
    sourceUnreadCount: record.sourceCoverage.unreadCount,
    sourceUnsupportedCount: record.sourceCoverage.unsupportedCount,
    sourceFailedCount: record.sourceCoverage.failedCount,
    sourceCoverageDetails: record.sourceCoverage.details,
    lastServiceM8SyncedAt: record.lastServiceM8SyncedAt,
    updatedAt: refreshedAt,
  };
}

function quoteRecordUpdateValues(
  record: QuoteMovementSnapshotInput,
  refreshedAt: Date,
) {
  const updates = { ...quoteRecordValues(record, refreshedAt) };
  Reflect.deleteProperty(updates, "servicem8JobUuid");
  return updates;
}

function retainedSourceState(
  retainedSources: Array<{
    occurredAt: Date | null;
    interpretationStatus: QuoteMovementInterpretationStatus | null;
  }>,
  currentCoverage: QuoteMovementSnapshotInput["sourceCoverage"],
): { latestActivityAt: Date | null; coverage: QuoteMovementSourceCoverage } {
  const unsupportedCount = retainedSources.filter(
    (source) => source.interpretationStatus === "unsupported",
  ).length;
  const retainedFailedCount = retainedSources.filter(
    (source) =>
      source.interpretationStatus === "failed" ||
      source.interpretationStatus === null,
  ).length;
  const currentFailedSources =
    currentCoverage.failedCount - currentCoverage.accessFailureCount;
  const currentUnreadSources =
    currentCoverage.unsupportedCount + currentFailedSources;
  const accessUnreadCount = Math.max(
    0,
    currentCoverage.unreadCount - currentUnreadSources,
  );
  const accessFailures = currentCoverage.accessFailureCount;
  const unreadCount =
    unsupportedCount + retainedFailedCount + accessUnreadCount;
  const failedCount = retainedFailedCount + accessFailures;
  const details = new Set<string>();
  if (unsupportedCount > 0) {
    details.add(
      `${unsupportedCount} ${quoteMovementSourceNoun(unsupportedCount)} ${unsupportedCount === 1 ? "has" : "have"} an unsupported file type.`,
    );
  }
  if (retainedFailedCount > 0) {
    details.add(
      `${retainedFailedCount} ${quoteMovementSourceNoun(retainedFailedCount)} could not be interpreted.`,
    );
  }
  currentCoverage.details
    .filter((detail) => !isAggregateSourceDetail(detail))
    .forEach((detail) => details.add(detail));

  return {
    latestActivityAt: latestQuoteMovementActivity(retainedSources),
    coverage: {
      status: unreadCount === 0 ? "complete" : "incomplete",
      discoveredCount:
        retainedSources.length + currentCoverage.unretainedSourceCount,
      unreadCount,
      unsupportedCount,
      failedCount,
      accessFailureCount: accessFailures,
      unretainedSourceCount: currentCoverage.unretainedSourceCount,
      details: Array.from(details),
    },
  };
}

function isAggregateSourceDetail(detail: string) {
  return (
    /^\d+ sources? (?:has|have) an unsupported file type\.$/.test(detail) ||
    /^\d+ sources? could not be interpreted\.$/.test(detail)
  );
}

function interpretationStatus(
  value: string | null,
): QuoteMovementInterpretationStatus | null {
  if (value === "interpreted" || value === "unsupported" || value === "failed")
    return value;
  return null;
}
