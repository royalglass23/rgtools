// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateQuoteMovementSummary,
  parseQuoteMovementSummary,
} from "../summary";

afterEach(() => vi.unstubAllEnvs());

describe("parseQuoteMovementSummary", () => {
  it("accepts the structured What Matters Now contract with contextual evidence", () => {
    const summary = parseQuoteMovementSummary(
      {
        currentPosition: {
          text: "Low-iron glass is confirmed; the final opening size is unresolved.",
          evidenceSourceIdentities: ["note-current"],
        },
        materialFacts: [
          {
            text: "The customer selected low-iron glass.",
            evidenceSourceIdentities: ["email-selection"],
          },
        ],
        importantDates: [
          {
            text: "Site measurement is booked for 24 July 2026.",
            evidenceSourceIdentities: ["note-booking"],
          },
        ],
        participants: [
          {
            text: "Mere is confirming the opening dimensions.",
            evidenceSourceIdentities: ["email-selection"],
          },
        ],
        unresolvedMatters: [
          {
            text: "Final opening dimensions still need confirmation.",
            evidenceSourceIdentities: ["note-current"],
          },
        ],
        latestMeaningfulMovement: {
          text: "The site measurement booking was confirmed.",
          evidenceSourceIdentities: ["note-booking"],
        },
        consentState: null,
      },
      ["note-current", "email-selection", "note-booking"],
    );

    expect(summary).toEqual({
      currentPosition: {
        text: "Low-iron glass is confirmed; the final opening size is unresolved.",
        evidenceSourceIdentities: ["note-current"],
      },
      materialFacts: [
        {
          text: "The customer selected low-iron glass.",
          evidenceSourceIdentities: ["email-selection"],
        },
      ],
      importantDates: [
        {
          text: "Site measurement is booked for 24 July 2026.",
          evidenceSourceIdentities: ["note-booking"],
        },
      ],
      participants: [
        {
          text: "Mere is confirming the opening dimensions.",
          evidenceSourceIdentities: ["email-selection"],
        },
      ],
      unresolvedMatters: [
        {
          text: "Final opening dimensions still need confirmation.",
          evidenceSourceIdentities: ["note-current"],
        },
      ],
      latestMeaningfulMovement: {
        text: "The site measurement booking was confirmed.",
        evidenceSourceIdentities: ["note-booking"],
      },
      consentState: null,
    });
  });

  it("rejects evidence that is not part of the retained source history", () => {
    expect(() =>
      parseQuoteMovementSummary(
        {
          currentPosition: {
            text: "The opening size is confirmed.",
            evidenceSourceIdentities: ["missing-note"],
          },
          materialFacts: [],
          importantDates: [],
          participants: [],
          unresolvedMatters: [],
          latestMeaningfulMovement: null,
          consentState: null,
        },
        ["retained-note"],
      ),
    ).toThrow("Summary evidence missing-note is not a retained source.");
  });
});

describe("generateQuoteMovementSummary", () => {
  it("summarises the complete retained source history through a controlled adapter", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    const providerSummary = {
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
    };
    const request = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ output_text: JSON.stringify(providerSummary) });
    });

    const summary = await generateQuoteMovementSummary(
      {
        recordId: "record-1",
        sourceFingerprint: "source-set-1",
        record: {
          servicem8JobUuid: "job-1",
          servicem8CompanyUuid: "company-1",
          servicem8Status: "Quote",
          jobNumber: "Q260223",
          customerName: "Aroha Glass",
          jobAddress: "1 Example Road",
          quoteValueExcludingGst: "1200.00",
          sourceUpdatedAt: new Date("2026-07-20T01:00:00Z"),
          latestActivityAt: new Date("2026-07-20T00:30:00Z"),
          sourceCoverage: {
            status: "complete",
            discoveredCount: 1,
            unreadCount: 0,
            unsupportedCount: 0,
            failedCount: 0,
            accessFailureCount: 0,
            unretainedSourceCount: 0,
            details: [],
          },
          sources: [
            {
              sourceType: "note",
              sourceIdentity: "note-current",
              occurredAt: new Date("2026-07-20T00:30:00Z"),
              content: { text: "Low-iron glass is confirmed." },
              enrichment: {
                interpretationStatus: "interpreted",
                summary: null,
                safeError: null,
              },
            },
          ],
          lastServiceM8SyncedAt: new Date("2026-07-20T01:05:00Z"),
        },
      },
      request,
    );
    const [url, init] = request.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    const adapterInput = JSON.parse(body.input);

    expect({
      summary,
      url,
      model: body.model,
      format: body.text.format.name,
      retainedSources: adapterInput.sources,
      sourceCoverage: adapterInput.sourceCoverage,
    }).toEqual({
      summary: providerSummary,
      url: "https://api.openai.com/v1/responses",
      model: "test-model",
      format: "quote_movement_what_matters_now",
      retainedSources: [
        expect.objectContaining({
          sourceIdentity: "note-current",
          content: { text: "Low-iron glass is confirmed." },
        }),
      ],
      sourceCoverage: expect.objectContaining({ status: "complete" }),
    });
  });
});
