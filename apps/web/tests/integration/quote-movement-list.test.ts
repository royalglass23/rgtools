// @vitest-environment node

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  getQuoteMovementRecord,
  listQuoteMovementRecords,
} from "@/modules/quote-movement/queries";
import {
  persistQuoteMovementSnapshot,
  updateQuoteMovementProjectComplexity,
} from "@/modules/quote-movement/repository";
import {
  listPendingQuoteMovementSummaries,
  saveValidQuoteMovementSummary,
} from "@/modules/quote-movement/summary-repository";
import {
  quoteMovementRecords,
  quoteMovementSourceEnrichment,
  quoteMovementSources,
} from "@rgtools/db/schema-quote-movement";
import { workOrders } from "@rgtools/db/schema-workorders";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDb("Quote Movement list persistence", () => {
  it("marks a reported Work Order converted without losing RG or source history", async () => {
    const rollbackSentinel = `ROLLBACK_MT_222_${crypto.randomUUID()}`;
    const servicem8JobUuid = `mt-222-converted-${crypto.randomUUID()}`;
    const convertedAt = new Date("2026-07-20T06:00:00Z");

    try {
      await db.transaction(async (tx) => {
        const [record] = await tx
          .insert(quoteMovementRecords)
          .values({
            servicem8JobUuid,
            servicem8Status: "Quote",
            servicem8Active: true,
            customerName: "Converted Customer",
            projectComplexity: "very_difficult",
            lastServiceM8SyncedAt: new Date("2026-07-20T05:00:00Z"),
          })
          .returning({ id: quoteMovementRecords.id });
        await tx.insert(quoteMovementSources).values({
          quoteMovementRecordId: record!.id,
          sourceType: "note",
          sourceIdentity: "retained-note",
          occurredAt: new Date("2026-07-20T04:00:00Z"),
          content: { text: "Customer approved the quote." },
          lastSeenAt: new Date("2026-07-20T05:00:00Z"),
        });

        await persistQuoteMovementSnapshot(tx, [], {
          actorId: null,
          refreshedAt: convertedAt,
          convertedJobUuids: [servicem8JobUuid],
        });

        const [converted] = await tx
          .select()
          .from(quoteMovementRecords)
          .where(eq(quoteMovementRecords.id, record!.id));
        const retainedSources = await tx
          .select()
          .from(quoteMovementSources)
          .where(eq(quoteMovementSources.quoteMovementRecordId, record!.id));

        expect(converted).toMatchObject({
          servicem8Status: "Work Order",
          servicem8Active: true,
          convertedAt,
          projectComplexity: "very_difficult",
        });
        expect(retainedSources).toHaveLength(1);

        throw new Error(rollbackSentinel);
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== rollbackSentinel) {
        throw error;
      }
    }
  });

  it("updates only the RG-owned Project Complexity field", async () => {
    const [record] = await db
      .insert(quoteMovementRecords)
      .values({
        servicem8JobUuid: `mt-221-update-${crypto.randomUUID()}`,
        servicem8Status: "Quote",
        customerName: "Complexity Test Customer",
        jobAddress: "21 Glass Street",
        quoteValueExcludingGst: "3210.00",
        lastServiceM8SyncedAt: new Date("2026-07-20T01:00:00Z"),
      })
      .returning({ id: quoteMovementRecords.id });

    try {
      await updateQuoteMovementProjectComplexity(record!.id, "tight");

      await expect(getQuoteMovementRecord(record!.id)).resolves.toMatchObject({
        id: record!.id,
        customerName: "Complexity Test Customer",
        jobAddress: "21 Glass Street",
        quoteValueExcludingGst: "3210.00",
        projectComplexity: "tight",
      });
    } finally {
      await db
        .delete(quoteMovementRecords)
        .where(eq(quoteMovementRecords.id, record!.id));
    }
  });

  it("defaults to Active records ordered by Latest Activity with nulls last", async () => {
    const fixtureKey = `MT-221 list ${crypto.randomUUID()}`;
    const records = await db
      .insert(quoteMovementRecords)
      .values([
        {
          servicem8JobUuid: `mt-221-newest-${crypto.randomUUID()}`,
          servicem8Status: "Quote",
          servicem8Active: true,
          jobNumber: "Q-MT221-NEWEST",
          customerName: `${fixtureKey} newest`,
          latestActivityAt: new Date("2026-07-20T03:00:00Z"),
          lastServiceM8SyncedAt: new Date("2026-07-20T04:00:00Z"),
        },
        {
          servicem8JobUuid: `mt-221-null-${crypto.randomUUID()}`,
          servicem8Status: "Quote",
          servicem8Active: true,
          jobNumber: "Q-MT221-NULL",
          customerName: `${fixtureKey} null`,
          latestActivityAt: null,
          lastServiceM8SyncedAt: new Date("2026-07-20T04:00:00Z"),
        },
        {
          servicem8JobUuid: `mt-221-inactive-${crypto.randomUUID()}`,
          servicem8Status: "Quote",
          servicem8Active: false,
          jobNumber: "Q-MT221-INACTIVE",
          customerName: `${fixtureKey} inactive`,
          latestActivityAt: new Date("2026-07-20T05:00:00Z"),
          lastServiceM8SyncedAt: new Date("2026-07-20T05:00:00Z"),
        },
      ])
      .returning({ id: quoteMovementRecords.id });

    try {
      const result = await listQuoteMovementRecords({ search: fixtureKey });

      expect(result.map((record) => record.jobNumber)).toEqual([
        "Q-MT221-NEWEST",
        "Q-MT221-NULL",
      ]);
    } finally {
      await db
        .delete(quoteMovementRecords)
        .where(eq(quoteMovementRecords.id, records[0]!.id));
      await Promise.all(
        records
          .slice(1)
          .map((record) =>
            db
              .delete(quoteMovementRecords)
              .where(eq(quoteMovementRecords.id, record.id)),
          ),
      );
    }
  });

  it("filters records by the selected Project Complexity", async () => {
    const fixtureKey = `MT-221 complexity ${crypto.randomUUID()}`;
    const records = await db
      .insert(quoteMovementRecords)
      .values([
        {
          servicem8JobUuid: `mt-221-tight-${crypto.randomUUID()}`,
          servicem8Status: "Quote",
          customerName: `${fixtureKey} tight`,
          projectComplexity: "tight",
          lastServiceM8SyncedAt: new Date("2026-07-20T01:00:00Z"),
        },
        {
          servicem8JobUuid: `mt-221-easy-${crypto.randomUUID()}`,
          servicem8Status: "Quote",
          customerName: `${fixtureKey} easy`,
          projectComplexity: "easy",
          lastServiceM8SyncedAt: new Date("2026-07-20T01:00:00Z"),
        },
      ])
      .returning({ id: quoteMovementRecords.id });

    try {
      const result = await listQuoteMovementRecords({
        search: fixtureKey,
        projectComplexity: "tight",
      });

      expect(result.map((record) => record.projectComplexity)).toEqual([
        "tight",
      ]);
    } finally {
      await Promise.all(
        records.map((record) =>
          db
            .delete(quoteMovementRecords)
            .where(eq(quoteMovementRecords.id, record.id)),
        ),
      );
    }
  });

  it("includes only explicitly converted records in the Converted view", async () => {
    const fixtureKey = `MT-221 lifecycle ${crypto.randomUUID()}`;
    const records = await db
      .insert(quoteMovementRecords)
      .values([
        {
          servicem8JobUuid: `mt-221-active-${crypto.randomUUID()}`,
          servicem8Status: "Quote",
          servicem8Active: true,
          customerName: `${fixtureKey} active`,
          lastServiceM8SyncedAt: new Date("2026-07-20T01:00:00Z"),
        },
        {
          servicem8JobUuid: `mt-221-inactive-${crypto.randomUUID()}`,
          servicem8Status: "Quote",
          servicem8Active: false,
          jobNumber: "Q-MT221-INACTIVE",
          customerName: `${fixtureKey} inactive`,
          lastServiceM8SyncedAt: new Date("2026-07-20T01:00:00Z"),
        },
        {
          servicem8JobUuid: `mt-222-converted-${crypto.randomUUID()}`,
          servicem8Status: "Work Order",
          servicem8Active: true,
          convertedAt: new Date("2026-07-20T02:00:00Z"),
          jobNumber: "Q-MT222-CONVERTED",
          customerName: `${fixtureKey} converted`,
          lastServiceM8SyncedAt: new Date("2026-07-20T02:00:00Z"),
        },
      ])
      .returning({ id: quoteMovementRecords.id });

    try {
      const result = await listQuoteMovementRecords({
        search: fixtureKey,
        lifecycle: "converted",
      });

      expect(result.map((record) => record.jobNumber)).toEqual([
        "Q-MT222-CONVERTED",
      ]);
    } finally {
      await Promise.all(
        records.map((record) =>
          db
            .delete(quoteMovementRecords)
            .where(eq(quoteMovementRecords.id, record.id)),
        ),
      );
    }
  });

  it("links a converted record to the current matching Work Order", async () => {
    const servicem8JobUuid = `mt-222-link-${crypto.randomUUID()}`;
    const [quoteMovementRecord] = await db
      .insert(quoteMovementRecords)
      .values({
        servicem8JobUuid,
        servicem8Status: "Work Order",
        servicem8Active: true,
        convertedAt: new Date("2026-07-20T03:00:00Z"),
        jobNumber: "Q-MT222-LINK",
        customerName: "Linked Work Order Customer",
        lastServiceM8SyncedAt: new Date("2026-07-20T03:00:00Z"),
      })
      .returning({ id: quoteMovementRecords.id });
    const [workOrder] = await db
      .insert(workOrders)
      .values({
        identityKind: "servicem8_job_uuid",
        identityValue: servicem8JobUuid,
        servicem8JobUuid,
        servicem8Status: "Work Order",
        servicem8Active: true,
        isCurrent: true,
        jobNumber: "Q-MT222-LINK",
        clientName: "Linked Work Order Customer",
      })
      .returning({ id: workOrders.id });

    try {
      const result = await listQuoteMovementRecords({
        search: "Q-MT222-LINK",
        lifecycle: "converted",
      });

      expect(result).toEqual([
        expect.objectContaining({
          id: quoteMovementRecord!.id,
          workOrderId: workOrder!.id,
        }),
      ]);
      await expect(
        getQuoteMovementRecord(quoteMovementRecord!.id),
      ).resolves.toMatchObject({
        id: quoteMovementRecord!.id,
        workOrderId: workOrder!.id,
      });
    } finally {
      await db.delete(workOrders).where(eq(workOrders.id, workOrder!.id));
      await db
        .delete(quoteMovementRecords)
        .where(eq(quoteMovementRecords.id, quoteMovementRecord!.id));
    }
  });

  it("sorts by Quote Value or Customer using the approved null handling", async () => {
    const fixtureKey = `MT-221 sort ${crypto.randomUUID()}`;
    const records = await db
      .insert(quoteMovementRecords)
      .values([
        {
          servicem8JobUuid: `mt-221-sort-zebra-${crypto.randomUUID()}`,
          servicem8Status: "Quote",
          jobNumber: "Q-MT221-ZEBRA",
          customerName: `${fixtureKey} Zebra`,
          quoteValueExcludingGst: "100.00",
          latestActivityAt: new Date("2026-07-20T03:00:00Z"),
          lastServiceM8SyncedAt: new Date("2026-07-20T04:00:00Z"),
        },
        {
          servicem8JobUuid: `mt-221-sort-alpha-${crypto.randomUUID()}`,
          servicem8Status: "Quote",
          jobNumber: "Q-MT221-ALPHA",
          customerName: `${fixtureKey} Alpha`,
          quoteValueExcludingGst: "200.00",
          latestActivityAt: new Date("2026-07-20T02:00:00Z"),
          lastServiceM8SyncedAt: new Date("2026-07-20T04:00:00Z"),
        },
        {
          servicem8JobUuid: `mt-221-sort-beta-${crypto.randomUUID()}`,
          servicem8Status: "Quote",
          jobNumber: "Q-MT221-BETA",
          customerName: `${fixtureKey} Beta`,
          quoteValueExcludingGst: null,
          latestActivityAt: new Date("2026-07-20T01:00:00Z"),
          lastServiceM8SyncedAt: new Date("2026-07-20T04:00:00Z"),
        },
      ])
      .returning({ id: quoteMovementRecords.id });

    try {
      const byQuoteValue = await listQuoteMovementRecords({
        search: fixtureKey,
        sort: "quote_value",
      });
      const byCustomer = await listQuoteMovementRecords({
        search: fixtureKey,
        sort: "customer",
      });

      expect(byQuoteValue.map((record) => record.jobNumber)).toEqual([
        "Q-MT221-ALPHA",
        "Q-MT221-ZEBRA",
        "Q-MT221-BETA",
      ]);
      expect(byCustomer.map((record) => record.jobNumber)).toEqual([
        "Q-MT221-ALPHA",
        "Q-MT221-BETA",
        "Q-MT221-ZEBRA",
      ]);
    } finally {
      await Promise.all(
        records.map((record) =>
          db
            .delete(quoteMovementRecords)
            .where(eq(quoteMovementRecords.id, record.id)),
        ),
      );
    }
  });

  it("searches Job number, customer, and address", async () => {
    const token = crypto.randomUUID();
    const [record] = await db
      .insert(quoteMovementRecords)
      .values({
        servicem8JobUuid: `mt-221-search-${token}`,
        servicem8Status: "Quote",
        jobNumber: `Q-${token}`,
        customerName: `Customer ${token}`,
        jobAddress: `Address ${token}`,
        lastServiceM8SyncedAt: new Date("2026-07-20T01:00:00Z"),
      })
      .returning({ id: quoteMovementRecords.id });

    try {
      for (const search of [
        `Q-${token}`,
        `Customer ${token}`,
        `Address ${token}`,
      ]) {
        const result = await listQuoteMovementRecords({ search });
        expect(result.map((candidate) => candidate.id)).toContain(record!.id);
      }
    } finally {
      await db
        .delete(quoteMovementRecords)
        .where(eq(quoteMovementRecords.id, record!.id));
    }
  });

  it("preserves RG-owned Project Complexity during ServiceM8 refresh", async () => {
    const rollbackSentinel = `ROLLBACK_MT_221_${crypto.randomUUID()}`;
    const servicem8JobUuid = `mt-221-refresh-${crypto.randomUUID()}`;

    try {
      await db.transaction(async (tx) => {
        const [record] = await tx
          .insert(quoteMovementRecords)
          .values({
            servicem8JobUuid,
            servicem8Status: "Quote",
            customerName: "Before refresh",
            projectComplexity: "very_difficult",
            lastServiceM8SyncedAt: new Date("2026-07-20T01:00:00Z"),
          })
          .returning({ id: quoteMovementRecords.id });

        await persistQuoteMovementSnapshot(
          tx,
          [
            {
              servicem8JobUuid,
              servicem8CompanyUuid: null,
              servicem8Status: "Quote",
              jobNumber: "Q-MT221-REFRESH",
              customerName: "After refresh",
              jobAddress: null,
              quoteValueExcludingGst: "500.00",
              sourceUpdatedAt: new Date("2026-07-20T02:00:00Z"),
              latestActivityAt: null,
              sourceCoverage: {
                status: "complete",
                discoveredCount: 0,
                unreadCount: 0,
                unsupportedCount: 0,
                failedCount: 0,
                accessFailureCount: 0,
                unretainedSourceCount: 0,
                details: [],
              },
              sources: [],
              lastServiceM8SyncedAt: new Date("2026-07-20T02:00:00Z"),
            },
          ],
          {
            actorId: null,
            refreshedAt: new Date("2026-07-20T02:00:00Z"),
          },
        );

        const [refreshed] = await tx
          .select()
          .from(quoteMovementRecords)
          .where(eq(quoteMovementRecords.id, record!.id));
        expect(refreshed).toMatchObject({
          customerName: "After refresh",
          projectComplexity: "very_difficult",
        });

        throw new Error(rollbackSentinel);
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== rollbackSentinel) {
        throw error;
      }
    }
  });

  it("summarises a retained source set once and becomes pending after new activity", async () => {
    const rollbackSentinel = `ROLLBACK_MT_223_${crypto.randomUUID()}`;
    const servicem8JobUuid = `mt-223-summary-${crypto.randomUUID()}`;

    try {
      await db.transaction(async (tx) => {
        const [record] = await tx
          .insert(quoteMovementRecords)
          .values({
            servicem8JobUuid,
            servicem8Status: "Quote",
            customerName: "Summary Customer",
            sourceCoverage: "complete",
            sourceDiscoveredCount: 1,
            lastServiceM8SyncedAt: new Date("2026-07-20T01:00:00Z"),
          })
          .returning({ id: quoteMovementRecords.id });
        const [firstSource] = await tx
          .insert(quoteMovementSources)
          .values({
            quoteMovementRecordId: record!.id,
            sourceType: "note",
            sourceIdentity: "note-current",
            occurredAt: new Date("2026-07-20T00:30:00Z"),
            content: { text: "Low-iron glass is confirmed." },
            lastSeenAt: new Date("2026-07-20T01:00:00Z"),
          })
          .returning({ id: quoteMovementSources.id });
        await tx.insert(quoteMovementSourceEnrichment).values({
          sourceId: firstSource!.id,
          interpretationStatus: "interpreted",
        });

        const firstPending = await listPendingQuoteMovementSummaries(
          [servicem8JobUuid],
          tx,
        );
        await saveValidQuoteMovementSummary(
          {
            recordId: record!.id,
            sourceFingerprint: firstPending[0]!.sourceFingerprint,
            generatedAt: new Date("2026-07-20T01:05:00Z"),
            summary: {
              currentPosition: {
                text: "Low-iron glass is confirmed.",
                evidenceSourceIdentities: ["note-current"],
              },
              materialFacts: [],
              importantDates: [],
              participants: [],
              unresolvedMatters: [],
              latestMeaningfulMovement: null,
              consentState: null,
            },
          },
          tx,
        );
        const unchangedPending = await listPendingQuoteMovementSummaries(
          [servicem8JobUuid],
          tx,
        );

        const [newSource] = await tx
          .insert(quoteMovementSources)
          .values({
            quoteMovementRecordId: record!.id,
            sourceType: "email",
            sourceIdentity: "email-new-activity",
            occurredAt: new Date("2026-07-20T02:00:00Z"),
            content: { body: "Please confirm the final opening size." },
            lastSeenAt: new Date("2026-07-20T02:05:00Z"),
          })
          .returning({ id: quoteMovementSources.id });
        await tx.insert(quoteMovementSourceEnrichment).values({
          sourceId: newSource!.id,
          interpretationStatus: "interpreted",
        });
        const changedPending = await listPendingQuoteMovementSummaries(
          [servicem8JobUuid],
          tx,
        );

        expect({
          first: firstPending.length,
          unchanged: unchangedPending.length,
          changed: changedPending.length,
          fingerprintChanged:
            changedPending[0]!.sourceFingerprint !==
            firstPending[0]!.sourceFingerprint,
        }).toEqual({
          first: 1,
          unchanged: 0,
          changed: 1,
          fingerprintChanged: true,
        });

        throw new Error(rollbackSentinel);
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== rollbackSentinel) {
        throw error;
      }
    }
  });
});
