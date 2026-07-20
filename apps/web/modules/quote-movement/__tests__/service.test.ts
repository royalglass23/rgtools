// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { refreshQuoteMovementFromServiceM8 } from "../service";
import type {
  QuoteMovementSnapshotInput,
  QuoteMovementSnapshotRepository,
} from "../sync";

describe("refreshQuoteMovementFromServiceM8", () => {
  it("uses automatic background summarisation in the application refresh path", async () => {
    let retainedRecord: QuoteMovementSnapshotInput | undefined;
    const repository: QuoteMovementSnapshotRepository = {
      async replaceActiveSnapshot(records) {
        retainedRecord = records[0];
      },
      async recordFailure() {},
    };
    const saved: unknown[] = [];
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");
      const filter = url.searchParams.get("$filter") ?? "";
      if (
        url.pathname === "/job.json" &&
        filter.includes("status eq 'Quote'")
      ) {
        return Response.json([
          {
            uuid: "job-1",
            active: 1,
            status: "Quote",
            generated_job_id: "Q260223",
          },
        ]);
      }
      return Response.json([]);
    });

    await refreshQuoteMovementFromServiceM8({
      actorId: "user-1",
      request,
      repository,
      interpretAttachments: async () => ({ files: [] }),
      readTrackedEngagement: async () => [],
      summaryRepository: {
        async listPendingSummaries() {
          return [
            {
              recordId: "record-1",
              sourceFingerprint: "first-source-set",
              record: retainedRecord!,
            },
          ];
        },
        async saveValidSummary(summary) {
          saved.push(summary);
        },
        async recordSummaryFailure() {},
      },
      summarize: async () => ({
        currentPosition: {
          text: "The quote is awaiting customer confirmation.",
          evidenceSourceIdentities: [],
        },
        materialFacts: [],
        importantDates: [],
        participants: [],
        unresolvedMatters: [],
        latestMeaningfulMovement: null,
        consentState: null,
      }),
    });

    expect(saved).toEqual([
      expect.objectContaining({
        recordId: "record-1",
        sourceFingerprint: "first-source-set",
        summary: expect.objectContaining({
          currentPosition: expect.objectContaining({
            text: "The quote is awaiting customer confirmation.",
          }),
        }),
      }),
    ]);
  });
});
