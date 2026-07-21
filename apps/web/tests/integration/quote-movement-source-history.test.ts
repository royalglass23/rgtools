// @vitest-environment node

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  quoteMovementRecords,
  quoteMovementSourceEnrichment,
  quoteMovementSources,
} from "@rgtools/db/schema-quote-movement";
import {
  persistQuoteMovementSnapshot,
  persistQuoteMovementSources,
} from "@/modules/quote-movement/repository";
import type { QuoteMovementSnapshotInput } from "@/modules/quote-movement/sync";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;
const ROLLBACK_SENTINEL = "ROLLBACK_MT_220_SOURCE_HISTORY_TEST";

describeWithDb("Quote Movement source-history persistence", () => {
  it("keeps one changed source across later absence and recalculates retained coverage", async () => {
    const jobUuid = `mt-220-job-${crypto.randomUUID()}`;
    const sourceIdentity = `mt-220-source-${crypto.randomUUID()}`;
    const firstAt = new Date("2026-07-20T01:00:00Z");
    const changedAt = new Date("2026-07-20T02:00:00Z");

    try {
      await db.transaction(async (tx) => {
        await persistQuoteMovementSnapshot(
          tx,
          [
            snapshot({
              jobUuid,
              sourceIdentity,
              sourceType: "file",
              occurredAt: firstAt,
              content: { name: "draft.pdf" },
              status: "interpreted",
              summary: "Initial interpretation.",
            }),
          ],
          { actorId: null, refreshedAt: firstAt },
        );

        await persistQuoteMovementSnapshot(
          tx,
          [
            snapshot({
              jobUuid,
              sourceIdentity,
              sourceType: "quote_change",
              occurredAt: changedAt,
              content: { name: "Quote 2.pdf" },
              status: "failed",
              summary: null,
            }),
          ],
          { actorId: null, refreshedAt: changedAt },
        );

        await persistQuoteMovementSnapshot(tx, [snapshot({ jobUuid })], {
          actorId: null,
          refreshedAt: new Date("2026-07-20T03:00:00Z"),
        });

        const [record] = await tx
          .select()
          .from(quoteMovementRecords)
          .where(eq(quoteMovementRecords.servicem8JobUuid, jobUuid));
        expect(record).toMatchObject({
          latestActivityAt: changedAt,
          sourceCoverage: "incomplete",
          sourceDiscoveredCount: 1,
          sourceUnreadCount: 1,
          sourceFailedCount: 1,
        });

        const sources = await tx
          .select({
            id: quoteMovementSources.id,
            sourceType: quoteMovementSources.sourceType,
            sourceIdentity: quoteMovementSources.sourceIdentity,
            content: quoteMovementSources.content,
          })
          .from(quoteMovementSources)
          .where(eq(quoteMovementSources.quoteMovementRecordId, record!.id));
        expect(sources).toEqual([
          expect.objectContaining({
            sourceType: "quote_change",
            sourceIdentity,
            content: { name: "Quote 2.pdf" },
          }),
        ]);

        const [enrichment] = await tx
          .select()
          .from(quoteMovementSourceEnrichment)
          .where(eq(quoteMovementSourceEnrichment.sourceId, sources[0]!.id));
        expect(enrichment).toMatchObject({
          interpretationStatus: "failed",
          summary: null,
          safeError: "This source could not be interpreted.",
        });

        throw new Error(ROLLBACK_SENTINEL);
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== ROLLBACK_SENTINEL)
        throw error;
    }
  });

  it("keeps source and enrichment consistent across separate concurrent transactions", async () => {
    const jobUuid = `mt-220-concurrency-${crypto.randomUUID()}`;
    const sourceIdentity = `mt-220-source-${crypto.randomUUID()}`;
    const firstAt = new Date("2026-07-20T04:00:00Z");
    const changedAt = new Date("2026-07-20T05:00:00Z");
    const [record] = await db
      .insert(quoteMovementRecords)
      .values({
        servicem8JobUuid: jobUuid,
        servicem8Status: "Quote",
        customerName: "MT-220 Concurrency Test",
        lastServiceM8SyncedAt: firstAt,
      })
      .returning({ id: quoteMovementRecords.id });

    try {
      const initialSources = snapshot({
        jobUuid,
        sourceIdentity,
        sourceType: "file",
        occurredAt: firstAt,
        content: { name: "draft.pdf" },
        status: "interpreted",
        summary: "Initial interpretation.",
      }).sources;
      await Promise.all([
        db.transaction((tx) =>
          persistQuoteMovementSources(tx, record!.id, initialSources, firstAt),
        ),
        db.transaction((tx) =>
          persistQuoteMovementSources(tx, record!.id, initialSources, firstAt),
        ),
      ]);

      const changedSources = snapshot({
        jobUuid,
        sourceIdentity,
        sourceType: "quote_change",
        occurredAt: changedAt,
        content: { name: "Quote 2.pdf" },
        status: "failed",
        summary: null,
      }).sources;
      await db.transaction((tx) =>
        persistQuoteMovementSources(tx, record!.id, changedSources, changedAt),
      );
      await db.transaction((tx) =>
        persistQuoteMovementSources(
          tx,
          record!.id,
          [],
          new Date("2026-07-20T06:00:00Z"),
        ),
      );

      const sources = await db
        .select({
          id: quoteMovementSources.id,
          sourceType: quoteMovementSources.sourceType,
          sourceIdentity: quoteMovementSources.sourceIdentity,
          content: quoteMovementSources.content,
        })
        .from(quoteMovementSources)
        .where(eq(quoteMovementSources.quoteMovementRecordId, record!.id));
      expect(sources).toEqual([
        expect.objectContaining({
          sourceType: "quote_change",
          sourceIdentity,
          content: { name: "Quote 2.pdf" },
        }),
      ]);

      const [enrichment] = await db
        .select()
        .from(quoteMovementSourceEnrichment)
        .where(eq(quoteMovementSourceEnrichment.sourceId, sources[0]!.id));
      expect(enrichment).toMatchObject({
        interpretationStatus: "failed",
        summary: null,
        safeError: "This source could not be interpreted.",
      });
    } finally {
      await db
        .delete(quoteMovementRecords)
        .where(eq(quoteMovementRecords.id, record!.id));
    }
  });
});

function snapshot(input: {
  jobUuid: string;
  sourceIdentity?: string;
  sourceType?: QuoteMovementSnapshotInput["sources"][number]["sourceType"];
  occurredAt?: Date;
  content?: Record<string, unknown>;
  status?: QuoteMovementSnapshotInput["sources"][number]["enrichment"]["interpretationStatus"];
  summary?: string | null;
}): QuoteMovementSnapshotInput {
  const sources: QuoteMovementSnapshotInput["sources"] = input.sourceIdentity
    ? [
        {
          sourceType: input.sourceType ?? "file",
          sourceIdentity: input.sourceIdentity,
          occurredAt: input.occurredAt ?? null,
          content: input.content ?? {},
          enrichment: {
            interpretationStatus: input.status ?? "interpreted",
            summary: input.summary ?? null,
            safeError:
              input.status === "failed"
                ? "This source could not be interpreted."
                : null,
          },
        },
      ]
    : [];

  const failedCount = sources.filter(
    (source) => source.enrichment.interpretationStatus === "failed",
  ).length;
  return {
    servicem8JobUuid: input.jobUuid,
    servicem8CompanyUuid: null,
    servicem8Status: "Quote",
    jobNumber: "MT-220-TEST",
    customerName: "MT-220 Test Customer",
    jobAddress: null,
    quoteValueExcludingGst: null,
    sourceUpdatedAt: null,
    latestActivityAt: input.occurredAt ?? null,
    sourceCoverage: {
      status: failedCount > 0 ? "incomplete" : "complete",
      discoveredCount: sources.length,
      unreadCount: failedCount,
      unsupportedCount: 0,
      failedCount,
      accessFailureCount: 0,
      unretainedSourceCount: 0,
      details: failedCount > 0 ? ["1 source could not be interpreted."] : [],
    },
    sources,
    lastServiceM8SyncedAt: new Date("2026-07-20T03:00:00Z"),
  };
}
