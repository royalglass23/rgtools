import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireModule = vi.hoisted(() => vi.fn());
const getQuoteMovementEvidence = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/guard", () => ({ requireModule }));
vi.mock("../queries", () => ({ getQuoteMovementEvidence }));
vi.mock("next/navigation", () => ({ notFound }));

import QuoteMovementEvidencePage from "@/app/(dashboard)/quote-movement/[id]/evidence/[sourceIdentity]/page";

describe("Quote Movement supporting evidence route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireModule.mockResolvedValue(undefined);
    getQuoteMovementEvidence.mockResolvedValue({
      recordId: "record-1",
      jobNumber: "Q260223",
      customerName: "Aroha Glass",
      sourceType: "note",
      occurredAt: new Date("2026-07-20T00:30:00Z"),
      content: { text: "Low-iron glass is confirmed." },
      interpretationStatus: "interpreted",
      interpretationSummary: null,
    });
  });

  it("shows one protected retained source behind a contextual evidence link", async () => {
    render(
      await QuoteMovementEvidencePage({
        params: Promise.resolve({
          id: "record-1",
          sourceIdentity: "note-current",
        }),
      }),
    );

    expect(requireModule).toHaveBeenCalledWith("quote-tracker");
    expect(getQuoteMovementEvidence).toHaveBeenCalledWith(
      "record-1",
      "note-current",
    );
    expect(
      screen.getByRole("heading", { name: "Supporting evidence" }),
    ).toBeVisible();
    expect(screen.getByText("ServiceM8 note")).toBeVisible();
    expect(screen.getByText("Low-iron glass is confirmed.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to What Matters Now" }),
    ).toHaveAttribute("href", "/quote-movement/record-1");
    expect(screen.queryByText("note-current")).not.toBeInTheDocument();
  });
});
