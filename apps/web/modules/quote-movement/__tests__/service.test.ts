// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  requestQuoteMovementRefresh,
  refreshQuoteMovementFromServiceM8,
} from "../service";
import type {
  QuoteMovementSnapshotInput,
  QuoteMovementSnapshotRepository,
} from "../sync";

describe("refreshQuoteMovementFromServiceM8", () => {
  it("fetches only the requested ServiceM8 job number and preserves other cached jobs", async () => {
    const requestedPaths: string[] = [];
    const savedRecords: QuoteMovementSnapshotInput[] = [];
    const request = vi.fn(async (path: string) => {
      requestedPaths.push(path);
      const url = new URL(path, "https://servicem8.example");
      const filter = url.searchParams.get("$filter") ?? "";

      if (
        url.pathname === "/job.json" &&
        filter.includes("generated_job_id eq 'Q260223'")
      ) {
        return Response.json([
          {
            uuid: "job-1",
            active: 1,
            status: "Quote",
            company_uuid: "company-1",
            generated_job_id: "Q260223",
          },
        ]);
      }
      if (
        url.pathname === "/company.json" &&
        filter.includes("uuid eq 'company-1'")
      ) {
        return Response.json([{ uuid: "company-1", name: "Target customer" }]);
      }
      if (
        url.pathname === "/jobmaterial.json" &&
        filter.includes("job_uuid eq 'job-1'")
      ) {
        return Response.json([]);
      }
      if (
        url.pathname === "/job.json" &&
        filter.includes("related_object_uuid")
      ) {
        return Response.json([]);
      }
      return Response.json([]);
    });

    await refreshQuoteMovementFromServiceM8({
      actorId: "user-1",
      jobNumber: "Q260223",
      request,
      repository: {
        async replaceActiveSnapshot(records) {
          savedRecords.push(...records);
        },
        async recordFailure() {},
      },
      summaryRepository: {
        async listPendingSummaries() {
          return [];
        },
        async saveValidSummary() {},
        async recordSummaryFailure() {},
      },
      interpretAttachments: async () => ({ files: [] }),
      readTrackedEngagement: async () => [],
    });

    expect(savedRecords).toHaveLength(1);
    expect(savedRecords[0]).toMatchObject({
      servicem8JobUuid: "job-1",
      jobNumber: "Q260223",
      customerName: "Target customer",
    });
    const requestedFilters = requestedPaths.map(
      (path) =>
        new URL(path, "https://servicem8.example").searchParams.get(
          "$filter",
        ) ?? "",
    );
    expect(
      requestedFilters.some((filter) =>
        filter.includes("generated_job_id eq 'Q260223'"),
      ),
    ).toBe(true);
    expect(
      requestedFilters.some((filter) => filter.includes("uuid eq 'company-1'")),
    ).toBe(true);
    expect(
      requestedFilters.some((filter) => filter.includes("job_uuid eq 'job-1'")),
    ).toBe(true);
    expect(
      requestedPaths.some(
        (path) =>
          path.includes("/company.json") &&
          !(
            new URL(path, "https://servicem8.example").searchParams.get(
              "$filter",
            ) ?? ""
          ).includes("uuid eq 'company-1'"),
      ),
    ).toBe(false);
  });

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

describe("requestQuoteMovementRefresh", () => {
  it("returns immediately after scheduling accepted work and carries the durable run identity", async () => {
    const scheduled: Array<() => Promise<void>> = [];
    const refresh = vi.fn(async () => ({
      synced: 2,
      refreshedAt: new Date("2026-07-21T01:00:00Z"),
    }));
    const coordinator = {
      request: vi.fn(async () => ({ accepted: true as const, runId: "run-1" })),
      finish: vi.fn(async () => undefined),
    };

    await expect(
      requestQuoteMovementRefresh({
        actorId: "user-1",
        coordinator,
        refresh,
        schedule: (work) => scheduled.push(work),
      }),
    ).resolves.toEqual({ status: "requested" });

    expect(refresh).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    await scheduled[0]!();

    expect(refresh).toHaveBeenCalledWith({ actorId: "user-1", runId: "run-1" });
    expect(coordinator.finish).toHaveBeenCalledWith("run-1");
  });

  it("does not schedule duplicate work when a durable refresh is already pending", async () => {
    const schedule = vi.fn();
    const refresh = vi.fn();

    await expect(
      requestQuoteMovementRefresh({
        actorId: "user-2",
        coordinator: {
          request: async () => ({ accepted: false as const }),
          finish: async () => undefined,
        },
        refresh,
        schedule,
      }),
    ).resolves.toEqual({ status: "already_pending" });

    expect(schedule).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("releases durable coordination after refresh failure", async () => {
    const finish = vi.fn(async () => undefined);
    const scheduled: Array<() => Promise<void>> = [];

    await requestQuoteMovementRefresh({
      actorId: null,
      coordinator: {
        request: async () => ({ accepted: true as const, runId: "run-2" }),
        finish,
      },
      refresh: async () => {
        throw new Error("safe refresh failure");
      },
      schedule: (work) => scheduled.push(work),
    });

    await expect(scheduled[0]!()).resolves.toBeUndefined();
    expect(finish).toHaveBeenCalledWith("run-2");
  });
});
