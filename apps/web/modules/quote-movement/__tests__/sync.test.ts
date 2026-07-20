// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  syncQuoteMovementFromServiceM8,
  type QuoteMovementSnapshotInput,
  type QuoteMovementSnapshotRepository,
} from "../sync";

function createMemoryRepository() {
  const rows = new Map<
    string,
    QuoteMovementSnapshotInput & { active: boolean }
  >();
  const failures: string[] = [];

  const repository: QuoteMovementSnapshotRepository = {
    async replaceActiveSnapshot(records) {
      for (const [uuid, record] of rows)
        rows.set(uuid, { ...record, active: false });
      for (const record of records)
        rows.set(record.servicem8JobUuid, { ...record, active: true });
    },
    async recordFailure(message) {
      failures.push(message);
    },
  };

  return {
    repository,
    failures,
    activeRows: () => Array.from(rows.values()).filter((row) => row.active),
  };
}

describe("syncQuoteMovementFromServiceM8", () => {
  it("automatically stores What Matters Now when a quote first appears", async () => {
    let retainedRecords: QuoteMovementSnapshotInput[] = [];
    const repository: QuoteMovementSnapshotRepository = {
      async replaceActiveSnapshot(records) {
        retainedRecords = records;
      },
      async recordFailure() {},
    };
    const savedSummaries: unknown[] = [];
    const summaryRepository = {
      async listPendingSummaries() {
        const record = retainedRecords[0]!;
        return [
          {
            recordId: "record-1",
            sourceFingerprint: "first-source-set",
            record,
          },
        ];
      },
      async saveValidSummary(summary: unknown) {
        savedSummaries.push(summary);
      },
      async recordSummaryFailure() {},
    };
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
            company_uuid: "company-1",
            generated_job_id: "Q260223",
            edit_date: "2026-07-20T01:00:00Z",
          },
        ]);
      }
      if (url.pathname === "/job.json") return Response.json([]);
      if (url.pathname === "/company.json") {
        return Response.json([{ uuid: "company-1", name: "Aroha Glass" }]);
      }
      if (url.pathname === "/note.json") {
        return Response.json([
          {
            uuid: "note-1",
            note: "Use low-iron glass; final opening size is still unconfirmed.",
            create_date: "2026-07-20T00:30:00Z",
          },
        ]);
      }
      if (
        url.pathname === "/jobmaterial.json" ||
        url.pathname === "/email.json" ||
        url.pathname === "/attachment.json"
      ) {
        return Response.json([]);
      }
      return Response.json([], { status: 404 });
    });
    const generatedAt = new Date("2026-07-20T02:00:00Z");

    await syncQuoteMovementFromServiceM8({
      request,
      repository,
      summaryRepository,
      summarize: async () => ({
        currentPosition: {
          text: "Low-iron glass is required; the opening size remains unresolved.",
          evidenceSourceIdentities: ["note-1"],
        },
        materialFacts: [],
        importantDates: [],
        participants: [],
        unresolvedMatters: [
          {
            text: "Confirm the final opening size.",
            evidenceSourceIdentities: ["note-1"],
          },
        ],
        latestMeaningfulMovement: {
          text: "Low-iron glass requirement recorded.",
          evidenceSourceIdentities: ["note-1"],
        },
        consentState: null,
      }),
      now: () => generatedAt,
    });

    expect(savedSummaries).toEqual([
      {
        recordId: "record-1",
        sourceFingerprint: "first-source-set",
        generatedAt,
        summary: expect.objectContaining({
          currentPosition: expect.objectContaining({
            text: "Low-iron glass is required; the opening size remains unresolved.",
          }),
        }),
      },
    ]);
  });

  it("keeps the last valid summary when background summarisation fails", async () => {
    let retainedRecord: QuoteMovementSnapshotInput | undefined;
    const repository: QuoteMovementSnapshotRepository = {
      async replaceActiveSnapshot(records) {
        retainedRecord = records[0];
      },
      async recordFailure() {},
    };
    const savedSummaries: unknown[] = [];
    const summaryFailures: unknown[] = [];
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
    const refreshedAt = new Date("2026-07-20T03:00:00Z");

    const result = await syncQuoteMovementFromServiceM8({
      request,
      repository,
      summaryRepository: {
        async listPendingSummaries() {
          return [
            {
              recordId: "record-1",
              sourceFingerprint: "changed-source-set",
              record: retainedRecord!,
            },
          ];
        },
        async saveValidSummary(summary) {
          savedSummaries.push(summary);
        },
        async recordSummaryFailure(recordId, message, attemptedAt) {
          summaryFailures.push({ recordId, message, attemptedAt });
        },
      },
      summarize: async () => {
        throw new Error("provider secret response body");
      },
      now: () => refreshedAt,
    });

    expect({ result, savedSummaries, summaryFailures }).toEqual({
      result: { synced: 1, refreshedAt },
      savedSummaries: [],
      summaryFailures: [
        {
          recordId: "record-1",
          message:
            "What Matters Now could not update. The previous valid summary was kept.",
          attemptedAt: refreshedAt,
        },
      ],
    });
  });

  it("reports active Work Order identities while caching only active Quotes", async () => {
    const replaceActiveSnapshot = vi.fn(async () => undefined);
    const repository: QuoteMovementSnapshotRepository = {
      replaceActiveSnapshot,
      recordFailure: vi.fn(async () => undefined),
    };
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");
      const filter = url.searchParams.get("$filter") ?? "";
      if (
        url.pathname === "/job.json" &&
        filter.includes("status eq 'Quote'")
      ) {
        return Response.json([
          {
            uuid: "job-quote",
            active: 1,
            status: "Quote",
            generated_job_id: "Q260222",
          },
        ]);
      }
      if (
        url.pathname === "/job.json" &&
        filter.includes("status eq 'Work Order'")
      ) {
        return Response.json([
          { uuid: "job-converted", active: 1, status: "Work Order" },
        ]);
      }
      if (
        url.pathname === "/company.json" ||
        url.pathname === "/jobmaterial.json" ||
        url.pathname === "/note.json" ||
        url.pathname === "/email.json" ||
        url.pathname === "/attachment.json"
      ) {
        return Response.json([]);
      }
      return Response.json([], { status: 404 });
    });
    const refreshedAt = new Date("2026-07-20T05:00:00Z");

    await syncQuoteMovementFromServiceM8({
      request,
      repository,
      now: () => refreshedAt,
    });

    expect(replaceActiveSnapshot).toHaveBeenCalledWith(
      [expect.objectContaining({ servicem8JobUuid: "job-quote" })],
      {
        actorId: null,
        refreshedAt,
        convertedJobUuids: ["job-converted"],
      },
    );
  });

  it("bounds per-job source collection concurrency", async () => {
    const memory = createMemoryRepository();
    let sourceRequestsInFlight = 0;
    let maximumSourceRequestsInFlight = 0;
    const jobs = Array.from({ length: 9 }, (_, index) => ({
      uuid: `job-${index + 1}`,
      active: 1,
      status: "Quote",
    }));
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");
      if (url.pathname === "/job.json") return Response.json(jobs);
      if (
        url.pathname === "/company.json" ||
        url.pathname === "/jobmaterial.json"
      ) {
        return Response.json([]);
      }
      if (
        url.pathname === "/note.json" ||
        url.pathname === "/email.json" ||
        url.pathname === "/attachment.json"
      ) {
        sourceRequestsInFlight += 1;
        maximumSourceRequestsInFlight = Math.max(
          maximumSourceRequestsInFlight,
          sourceRequestsInFlight,
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
        sourceRequestsInFlight -= 1;
        return Response.json([]);
      }
      return Response.json([], { status: 404 });
    });

    await syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
    });

    expect(memory.activeRows()).toHaveLength(9);
    expect(maximumSourceRequestsInFlight).toBeLessThanOrEqual(12);
  });

  it("uses every established ServiceM8 note and email content/date fallback", async () => {
    const memory = createMemoryRepository();
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");
      if (url.pathname === "/job.json") {
        return Response.json([{ uuid: "job-1", active: 1, status: "Quote" }]);
      }
      if (url.pathname === "/note.json") {
        return Response.json([
          {
            uuid: "note-message",
            message: "Customer approved the revised option.",
            date: "2026-07-17T01:00:00Z",
          },
        ]);
      }
      if (url.pathname === "/email.json") {
        return Response.json([
          {
            uuid: "email-html",
            html: "<p>Please proceed.</p>",
            date: "2026-07-17T02:00:00Z",
          },
        ]);
      }
      if (
        url.pathname === "/company.json" ||
        url.pathname === "/jobmaterial.json" ||
        url.pathname === "/attachment.json"
      ) {
        return Response.json([]);
      }
      return Response.json([], { status: 404 });
    });

    await syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
    });

    expect(memory.activeRows()[0]).toMatchObject({
      latestActivityAt: new Date("2026-07-17T02:00:00Z"),
      sourceCoverage: { status: "complete", unreadCount: 0 },
      sources: [
        expect.objectContaining({
          sourceIdentity: "note-message",
          content: {
            text: "Customer approved the revised option.",
            actionRequired: null,
          },
        }),
        expect.objectContaining({
          sourceIdentity: "email-html",
          content: {
            subject: null,
            body: "<p>Please proceed.</p>",
            direction: null,
          },
        }),
      ],
    });
  });

  it("marks returned notes and emails incomplete when content or activity date is unusable", async () => {
    const memory = createMemoryRepository();
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");
      if (url.pathname === "/job.json") {
        return Response.json([{ uuid: "job-1", active: 1, status: "Quote" }]);
      }
      if (url.pathname === "/note.json") {
        return Response.json([
          { uuid: "note-empty", date: "2026-07-17T01:00:00Z" },
        ]);
      }
      if (url.pathname === "/email.json") {
        return Response.json([
          { uuid: "email-no-date", subject: "Quote update" },
        ]);
      }
      if (
        url.pathname === "/company.json" ||
        url.pathname === "/jobmaterial.json" ||
        url.pathname === "/attachment.json"
      ) {
        return Response.json([]);
      }
      return Response.json([], { status: 404 });
    });

    await syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
    });

    expect(memory.activeRows()[0]).toMatchObject({
      latestActivityAt: new Date("2026-07-17T01:00:00Z"),
      sourceCoverage: {
        status: "incomplete",
        discoveredCount: 2,
        unreadCount: 2,
        failedCount: 2,
      },
      sources: [
        expect.objectContaining({
          sourceIdentity: "note-empty",
          enrichment: expect.objectContaining({
            interpretationStatus: "failed",
          }),
        }),
        expect.objectContaining({
          sourceIdentity: "email-no-date",
          enrichment: expect.objectContaining({
            interpretationStatus: "failed",
          }),
        }),
      ],
    });
  });

  it("keeps one source when ServiceM8 reclassifies the same attachment identity", async () => {
    const memory = createMemoryRepository();
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");
      if (url.pathname === "/job.json") {
        return Response.json([{ uuid: "job-1", active: 1, status: "Quote" }]);
      }
      if (url.pathname === "/attachment.json") {
        return Response.json([
          {
            uuid: "attachment-1",
            attachment_name: "draft.pdf",
            attachment_source: "JOB",
            file_type: ".pdf",
            edit_date: "2026-07-17T01:00:00Z",
          },
          {
            uuid: "attachment-1",
            attachment_name: "Quote 2.pdf",
            attachment_source: "QUOTE",
            file_type: ".pdf",
            edit_date: "2026-07-17T02:00:00Z",
          },
        ]);
      }
      if (
        url.pathname === "/company.json" ||
        url.pathname === "/jobmaterial.json" ||
        url.pathname === "/note.json" ||
        url.pathname === "/email.json"
      )
        return Response.json([]);
      return Response.json([], { status: 404 });
    });
    const interpretAttachments = vi.fn(async () => ({
      files: [
        {
          servicem8AttachmentUuid: "attachment-1",
          status: "interpreted" as const,
          summary: "Quote revision.",
        },
      ],
    }));

    await syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
      interpretAttachments,
    });

    expect(memory.activeRows()[0]).toMatchObject({
      sourceCoverage: { discoveredCount: 1 },
      sources: [
        expect.objectContaining({
          sourceType: "quote_change",
          sourceIdentity: "attachment-1",
          occurredAt: new Date("2026-07-17T02:00:00Z"),
        }),
      ],
    });
  });

  it("marks coverage incomplete when a discovered source has no stable identity", async () => {
    const memory = createMemoryRepository();
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");
      if (url.pathname === "/job.json") {
        return Response.json([{ uuid: "job-1", active: 1, status: "Quote" }]);
      }
      if (url.pathname === "/note.json") {
        return Response.json([
          {
            note: "This row has no UUID.",
            create_date: "2026-07-17T01:00:00Z",
          },
        ]);
      }
      if (
        url.pathname === "/company.json" ||
        url.pathname === "/jobmaterial.json" ||
        url.pathname === "/email.json" ||
        url.pathname === "/attachment.json"
      )
        return Response.json([]);
      return Response.json([], { status: 404 });
    });

    await syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
    });

    expect(memory.activeRows()[0]).toMatchObject({
      sourceCoverage: {
        status: "incomplete",
        discoveredCount: 1,
        unreadCount: 1,
        failedCount: 1,
        accessFailureCount: 1,
        details: [
          "1 ServiceM8 source could not be retained because its stable identity was missing.",
        ],
      },
      sources: [],
    });
  });

  it("deduplicates repeated source rows by stable ServiceM8 identity", async () => {
    const memory = createMemoryRepository();
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");
      if (url.pathname === "/job.json") {
        return Response.json([{ uuid: "job-1", active: 1, status: "Quote" }]);
      }
      if (url.pathname === "/note.json") {
        return Response.json([
          {
            uuid: "note-1",
            note: "Initial note",
            edit_date: "2026-07-17T01:00:00Z",
          },
          {
            uuid: "note-1",
            note: "Updated note",
            edit_date: "2026-07-17T02:00:00Z",
          },
        ]);
      }
      if (
        url.pathname === "/company.json" ||
        url.pathname === "/jobmaterial.json" ||
        url.pathname === "/email.json" ||
        url.pathname === "/attachment.json"
      )
        return Response.json([]);
      return Response.json([], { status: 404 });
    });

    await syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
    });

    expect(memory.activeRows()[0]).toMatchObject({
      sourceCoverage: { discoveredCount: 1 },
      sources: [
        {
          sourceType: "note",
          sourceIdentity: "note-1",
          occurredAt: new Date("2026-07-17T02:00:00Z"),
          content: { text: "Updated note", actionRequired: null },
          enrichment: {
            interpretationStatus: "interpreted",
            summary: null,
            safeError: null,
          },
        },
      ],
    });
  });

  it("retains tracked customer opens and downloads in the complete source set", async () => {
    const memory = createMemoryRepository();
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");
      if (url.pathname === "/job.json") {
        return Response.json([
          {
            uuid: "job-1",
            active: 1,
            status: "Quote",
            generated_job_id: "Q260101",
          },
        ]);
      }
      if (
        url.pathname === "/company.json" ||
        url.pathname === "/jobmaterial.json" ||
        url.pathname === "/note.json" ||
        url.pathname === "/email.json" ||
        url.pathname === "/attachment.json"
      )
        return Response.json([]);
      return Response.json([], { status: 404 });
    });
    const readTrackedEngagement = vi.fn(async () => [
      {
        id: "event-open-1",
        eventType: "open" as const,
        occurredAt: new Date("2026-07-17T02:00:00Z"),
      },
      {
        id: "event-download-1",
        eventType: "download" as const,
        occurredAt: new Date("2026-07-17T03:00:00Z"),
      },
    ]);

    await syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
      readTrackedEngagement,
    });

    expect(memory.activeRows()[0]).toMatchObject({
      latestActivityAt: new Date("2026-07-17T03:00:00Z"),
      sourceCoverage: {
        status: "complete",
        discoveredCount: 2,
        unreadCount: 0,
      },
      sources: [
        expect.objectContaining({
          sourceType: "tracked_open",
          sourceIdentity: "event-open-1",
        }),
        expect.objectContaining({
          sourceType: "tracked_download",
          sourceIdentity: "event-download-1",
        }),
      ],
    });
    expect(readTrackedEngagement).toHaveBeenCalledWith("job-1");
  });

  it("keeps the quote refresh usable when one source collection cannot be read", async () => {
    const memory = createMemoryRepository();
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");

      if (url.pathname === "/job.json") {
        return Response.json([
          {
            uuid: "job-1",
            active: 1,
            status: "Quote",
            generated_job_id: "Q260101",
          },
        ]);
      }
      if (
        url.pathname === "/company.json" ||
        url.pathname === "/jobmaterial.json"
      ) {
        return Response.json([]);
      }
      if (url.pathname === "/note.json") {
        return Response.json([
          {
            uuid: "note-1",
            note: "Customer confirmed the install date.",
            create_date: "2026-07-17T01:00:00Z",
          },
        ]);
      }
      if (url.pathname === "/email.json")
        return Response.json([], { status: 503 });
      if (url.pathname === "/attachment.json") return Response.json([]);
      return Response.json([], { status: 404 });
    });

    await expect(
      syncQuoteMovementFromServiceM8({
        request,
        repository: memory.repository,
      }),
    ).resolves.toMatchObject({ synced: 1 });

    expect(memory.activeRows()[0]).toMatchObject({
      sourceCoverage: {
        status: "incomplete",
        discoveredCount: 1,
        unreadCount: 1,
        unsupportedCount: 0,
        failedCount: 1,
        details: ["ServiceM8 email source history could not be read."],
      },
      sources: [expect.objectContaining({ sourceIdentity: "note-1" })],
    });
    expect(memory.failures).toEqual([]);
  });

  it("classifies retained attachments and reports incomplete coverage safely", async () => {
    const memory = createMemoryRepository();
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");

      if (url.pathname === "/job.json") {
        return Response.json([
          {
            uuid: "job-1",
            active: 1,
            status: "Quote",
            generated_job_id: "Q260101",
          },
        ]);
      }
      if (
        url.pathname === "/company.json" ||
        url.pathname === "/jobmaterial.json"
      ) {
        return Response.json([]);
      }
      if (url.pathname === "/note.json" || url.pathname === "/email.json") {
        return Response.json([]);
      }
      if (url.pathname === "/attachment.json") {
        return Response.json([
          {
            uuid: "photo-1",
            related_object_uuid: "job-1",
            attachment_name: "site.jpg",
            attachment_source: "PHOTO",
            file_type: ".jpg",
            edit_date: "2026-07-17T01:00:00Z",
          },
          {
            uuid: "file-1",
            related_object_uuid: "job-1",
            attachment_name: "detail.dwg",
            attachment_source: "JOB",
            file_type: ".dwg",
            edit_date: "2026-07-17T02:00:00Z",
          },
          {
            uuid: "quote-revision-1",
            related_object_uuid: "job-1",
            attachment_name: "Quote 2.pdf",
            attachment_source: "QUOTE",
            file_type: ".pdf",
            edit_date: "2026-07-17T03:00:00Z",
          },
        ]);
      }
      return Response.json([], { status: 404 });
    });
    const interpretAttachments = vi.fn(async () => ({
      files: [
        {
          servicem8AttachmentUuid: "photo-1",
          status: "interpreted" as const,
          summary: "Pool fence location.",
        },
        {
          servicem8AttachmentUuid: "file-1",
          status: "unsupported" as const,
          summary: null,
        },
        {
          servicem8AttachmentUuid: "quote-revision-1",
          status: "failed" as const,
          summary: null,
        },
      ],
    }));

    await syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
      interpretAttachments,
      now: () => new Date("2026-07-17T04:00:00Z"),
    });

    expect(memory.activeRows()[0]).toMatchObject({
      latestActivityAt: new Date("2026-07-17T03:00:00Z"),
      sourceCoverage: {
        status: "incomplete",
        discoveredCount: 3,
        unreadCount: 2,
        unsupportedCount: 1,
        failedCount: 1,
        details: [
          "1 source has an unsupported file type.",
          "1 source could not be interpreted.",
        ],
      },
      sources: [
        expect.objectContaining({
          sourceType: "photo",
          sourceIdentity: "photo-1",
          enrichment: expect.objectContaining({
            interpretationStatus: "interpreted",
          }),
        }),
        expect.objectContaining({
          sourceType: "file",
          sourceIdentity: "file-1",
          enrichment: expect.objectContaining({
            interpretationStatus: "unsupported",
          }),
        }),
        expect.objectContaining({
          sourceType: "quote_change",
          sourceIdentity: "quote-revision-1",
          enrichment: expect.objectContaining({
            interpretationStatus: "failed",
          }),
        }),
      ],
    });
    expect(interpretAttachments).toHaveBeenCalledWith("job-1");
  });

  it("retains every ServiceM8 note and email by stable source identity", async () => {
    const memory = createMemoryRepository();
    const request = vi.fn(async (path: string) => {
      const url = new URL(path, "https://servicem8.example");

      if (url.pathname === "/job.json") {
        return Response.json([
          {
            uuid: "job-1",
            active: 1,
            status: "Quote",
            company_uuid: "company-1",
            generated_job_id: "Q260101",
          },
        ]);
      }
      if (url.pathname === "/company.json") {
        return Response.json([{ uuid: "company-1", name: "Alpha Homes" }]);
      }
      if (url.pathname === "/jobmaterial.json") return Response.json([]);
      if (url.pathname === "/note.json") {
        return Response.json([
          {
            uuid: "note-1",
            related_object_uuid: "job-1",
            note: "Measure confirmed on site.",
            create_date: "2026-07-17T01:00:00Z",
          },
          {
            uuid: "note-2",
            related_object_uuid: "job-1",
            note: "Customer requested obscure glass.",
            create_date: "2026-07-17T02:00:00Z",
          },
        ]);
      }
      if (url.pathname === "/email.json") {
        return Response.json([
          {
            uuid: "email-1",
            related_object_uuid: "job-1",
            subject: "Re: Glass quote",
            message_text: "Please proceed with the revised option.",
            direction: "inbound",
            sent_date: "2026-07-17T03:00:00Z",
          },
        ]);
      }
      if (url.pathname === "/attachment.json") return Response.json([]);

      return Response.json([], { status: 404 });
    });

    await syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
      now: () => new Date("2026-07-17T04:00:00Z"),
    });

    expect(memory.activeRows()[0]).toMatchObject({
      latestActivityAt: new Date("2026-07-17T03:00:00Z"),
      sourceCoverage: {
        status: "complete",
        discoveredCount: 3,
        unreadCount: 0,
        unsupportedCount: 0,
        failedCount: 0,
        accessFailureCount: 0,
        unretainedSourceCount: 0,
        details: [],
      },
      sources: [
        expect.objectContaining({
          sourceType: "note",
          sourceIdentity: "note-1",
          occurredAt: new Date("2026-07-17T01:00:00Z"),
          enrichment: expect.objectContaining({
            interpretationStatus: "interpreted",
          }),
        }),
        expect.objectContaining({
          sourceType: "note",
          sourceIdentity: "note-2",
          occurredAt: new Date("2026-07-17T02:00:00Z"),
          enrichment: expect.objectContaining({
            interpretationStatus: "interpreted",
          }),
        }),
        expect.objectContaining({
          sourceType: "email",
          sourceIdentity: "email-1",
          occurredAt: new Date("2026-07-17T03:00:00Z"),
          enrichment: expect.objectContaining({
            interpretationStatus: "interpreted",
          }),
        }),
      ],
    });
    expect(request.mock.calls.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^\/note\.json.*related_object_uuid.*job-1.*cursor=-1/,
        ),
        expect.stringMatching(
          /^\/email\.json.*related_object_uuid.*job-1.*cursor=-1/,
        ),
      ]),
    );
  });

  it("caches every active Quote job across ServiceM8 pages using read-only requests", async () => {
    const memory = createMemoryRepository();
    const requestedMethods: Array<string | undefined> = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requestedMethods.push(init?.method);
      const url = new URL(path, "https://servicem8.example");
      const cursor = url.searchParams.get("cursor");

      if (url.pathname === "/job.json") {
        if (cursor === "-1") {
          return Response.json(
            [
              {
                uuid: "job-1",
                active: 1,
                status: "Quote",
                company_uuid: "company-1",
                generated_job_id: "Q260101",
                job_address: "1 Glass Lane",
                edit_date: "2026-07-17T01:00:00Z",
              },
            ],
            { headers: { "x-next-cursor": "job-page-2" } },
          );
        }
        return Response.json([
          {
            uuid: "job-2",
            active: "1",
            status: " Quote ",
            company_uuid: "company-2",
            generated_job_id: "Q260102",
            job_address: "2 Window Road",
            edit_date: "2026-07-17T02:00:00Z",
          },
        ]);
      }

      if (url.pathname === "/company.json") {
        return Response.json([
          { uuid: "company-1", name: "Alpha Homes" },
          { uuid: "company-2", name: "Beta Builds" },
        ]);
      }

      if (url.pathname === "/jobmaterial.json") {
        return Response.json([
          {
            uuid: "line-1",
            active: 1,
            job_uuid: "job-1",
            quantity: "2",
            price: "100",
          },
          {
            uuid: "line-2",
            active: 1,
            job_uuid: "job-2",
            quantity: "1",
            price: "75.50",
          },
          {
            uuid: "old-line",
            active: 0,
            job_uuid: "job-1",
            quantity: "1",
            price: "999",
          },
        ]);
      }

      if (
        url.pathname === "/note.json" ||
        url.pathname === "/email.json" ||
        url.pathname === "/attachment.json"
      ) {
        return Response.json([]);
      }

      return Response.json([], { status: 404 });
    });
    const now = new Date("2026-07-17T03:00:00Z");

    await expect(
      syncQuoteMovementFromServiceM8({
        request,
        repository: memory.repository,
        actorId: "user-1",
        now: () => now,
      }),
    ).resolves.toEqual({ synced: 2, refreshedAt: now });

    expect(memory.activeRows()).toEqual([
      expect.objectContaining({
        servicem8JobUuid: "job-1",
        jobNumber: "Q260101",
        customerName: "Alpha Homes",
        jobAddress: "1 Glass Lane",
        quoteValueExcludingGst: "200.00",
        servicem8Status: "Quote",
      }),
      expect.objectContaining({
        servicem8JobUuid: "job-2",
        jobNumber: "Q260102",
        customerName: "Beta Builds",
        quoteValueExcludingGst: "75.50",
        servicem8Status: "Quote",
      }),
    ]);
    expect(
      requestedMethods.every(
        (method) => method === undefined || method === "GET",
      ),
    ).toBe(true);
    expect(request.mock.calls.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\/job\.json.*cursor=-1/),
        expect.stringMatching(/^\/job\.json.*cursor=job-page-2/),
      ]),
    );
  });

  it("keeps the previous cached snapshot when ServiceM8 refresh fails", async () => {
    const memory = createMemoryRepository();
    await memory.repository.replaceActiveSnapshot(
      [
        {
          servicem8JobUuid: "cached-job",
          servicem8CompanyUuid: null,
          servicem8Status: "Quote",
          jobNumber: "Q260099",
          customerName: "Cached Customer",
          jobAddress: null,
          quoteValueExcludingGst: "500.00",
          sourceUpdatedAt: null,
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
          lastServiceM8SyncedAt: new Date("2026-07-16T03:00:00Z"),
        },
      ],
      { actorId: "user-1", refreshedAt: new Date("2026-07-16T03:00:00Z") },
    );
    const request = vi.fn(async (path: string) =>
      path.startsWith("/job.json")
        ? Response.json([], { status: 503 })
        : Response.json([]),
    );

    await expect(
      syncQuoteMovementFromServiceM8({
        request,
        repository: memory.repository,
        actorId: "user-1",
      }),
    ).rejects.toThrow("ServiceM8 Quote Movement refresh failed with HTTP 503.");

    expect(memory.activeRows()).toEqual([
      expect.objectContaining({
        servicem8JobUuid: "cached-job",
        customerName: "Cached Customer",
      }),
    ]);
    expect(memory.failures).toEqual([
      "ServiceM8 Quote Movement refresh failed with HTTP 503.",
    ]);
  });
});
