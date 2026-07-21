import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuoteMovementList } from "../QuoteMovementList";

describe("QuoteMovementList", () => {
  it("shows only the approved list-level controls", () => {
    render(
      <QuoteMovementList
        records={[]}
        selectedControls={{
          search: "",
          projectComplexity: "all",
          lifecycle: "active",
          sort: "latest_activity",
        }}
        updateComplexityAction={vi.fn()}
      />,
    );

    const controls = within(
      screen.getByRole("form", { name: "Quote Movement controls" }),
    );
    expect(controls.getByRole("searchbox", { name: "Search" })).toBeVisible();
    expect(
      controls.getByRole("combobox", { name: "Complexity" }),
    ).toBeVisible();
    expect(
      controls.getByRole("combobox", { name: "Active/Converted" }),
    ).toBeVisible();
    expect(controls.getByRole("combobox", { name: "Sort" })).toBeVisible();
    expect(controls.getAllByRole("combobox")).toHaveLength(3);
    expect(controls.queryByText(/priority|ranking/i)).not.toBeInTheDocument();
  });

  it("renders the approved five-column monitoring row", () => {
    render(
      <QuoteMovementList
        records={[
          {
            id: "record-1",
            jobNumber: "Q260221",
            customerName: "Alpha Homes",
            jobAddress: "21 Glass Street",
            quoteValueExcludingGst: "6250.00",
            projectComplexity: "unassessed",
            latestActivityAt: new Date("2026-07-20T03:00:00Z"),
            convertedAt: null,
            workOrderId: null,
          },
        ]}
        selectedControls={{
          search: "",
          projectComplexity: "all",
          lifecycle: "active",
          sort: "latest_activity",
        }}
        updateComplexityAction={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual([
      "Job",
      "Quote Value excluding GST",
      "Project Complexity",
      "Latest Activity",
      "Important Now",
    ]);
    const jobCell = screen.getByRole("cell", {
      name: /Q260221 Alpha Homes 21 Glass Street/,
    });
    expect(jobCell).toBeVisible();
    expect(screen.getByRole("link", { name: "Q260221" })).toHaveAttribute(
      "href",
      "/quote-movement/record-1",
    );
    const complexity = screen.getByRole("combobox", {
      name: "Project Complexity for Q260221",
    });
    expect(
      within(complexity)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Unassessed", "Easy", "Normal", "Tight", "Very Difficult"]);
    expect(screen.getByText("Not yet summarised")).toBeVisible();
    expect(screen.queryByText(/priority|ranking/i)).not.toBeInTheDocument();
  });

  it("shows cached Important Now content with explicit Source Coverage", () => {
    render(
      <QuoteMovementList
        records={[
          {
            id: "record-1",
            jobNumber: "Q260223",
            customerName: "Aroha Glass",
            jobAddress: "1 Example Road",
            quoteValueExcludingGst: "1200.00",
            projectComplexity: "normal",
            latestActivityAt: new Date("2026-07-20T03:00:00Z"),
            convertedAt: null,
            workOrderId: null,
            importantDetailsSummary: {
              currentPosition: {
                text: "Low-iron glass is confirmed; opening size is unresolved.",
                evidenceSourceIdentities: ["note-current"],
              },
              materialFacts: [],
              importantDates: [],
              participants: [],
              unresolvedMatters: [],
              latestMeaningfulMovement: null,
              consentState: null,
            },
            sourceCoverage: "incomplete",
            sourceUnreadCount: 2,
          },
        ]}
        selectedControls={{
          search: "",
          projectComplexity: "all",
          lifecycle: "active",
          sort: "latest_activity",
        }}
        updateComplexityAction={vi.fn()}
      />,
    );

    const importantNow = screen.getByRole("cell", {
      name: /Low-iron glass is confirmed; opening size is unresolved/,
    });
    expect(importantNow).toHaveTextContent("Incomplete Source Coverage");
    expect(importantNow).toHaveTextContent("2 unread sources");
    expect(
      screen.queryByRole("button", { name: /generate/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/score|ranking|recommended action/i),
    ).not.toBeInTheDocument();
  });

  it("shows incomplete coverage and a safe first-summary failure before any summary exists", () => {
    render(
      <QuoteMovementList
        records={[
          {
            id: "record-1",
            jobNumber: "Q260224",
            customerName: "Cached Customer",
            jobAddress: "24 Glass Lane",
            quoteValueExcludingGst: "2400.00",
            projectComplexity: "normal",
            latestActivityAt: new Date("2026-07-21T01:00:00Z"),
            convertedAt: null,
            workOrderId: null,
            sourceCoverage: "incomplete",
            sourceUnreadCount: 1,
            summaryLastError:
              "What Matters Now could not update. The previous valid summary was kept.",
          },
        ]}
        selectedControls={{
          search: "",
          projectComplexity: "all",
          lifecycle: "active",
          sort: "latest_activity",
        }}
        updateComplexityAction={vi.fn()}
      />,
    );

    const importantNow = screen.getByRole("cell", { name: /Not yet summarised/ });
    expect(importantNow).toHaveTextContent("Incomplete Source Coverage");
    expect(importantNow).toHaveTextContent("1 unread source");
    expect(importantNow).toHaveTextContent("What Matters Now could not update");
  });

  it("submits the selected complexity for only that record", async () => {
    const user = userEvent.setup();
    const updateComplexityAction = vi.fn(async (formData: FormData) => {
      void formData;
    });
    render(
      <QuoteMovementList
        records={[
          {
            id: "record-1",
            jobNumber: "Q260221",
            customerName: "Alpha Homes",
            jobAddress: "21 Glass Street",
            quoteValueExcludingGst: "6250.00",
            projectComplexity: "unassessed",
            latestActivityAt: null,
            convertedAt: null,
            workOrderId: null,
          },
        ]}
        selectedControls={{
          search: "",
          projectComplexity: "all",
          lifecycle: "active",
          sort: "latest_activity",
        }}
        updateComplexityAction={updateComplexityAction}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Project Complexity for Q260221",
      }),
      "tight",
    );

    expect(updateComplexityAction).toHaveBeenCalledOnce();
    const submitted = updateComplexityAction.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(submitted.entries())).toEqual({
      recordId: "record-1",
      projectComplexity: "tight",
    });
  });

  it("continues converted records in Work Orders or reports an unmatched record", () => {
    render(
      <QuoteMovementList
        records={[
          {
            id: "converted-linked",
            jobNumber: "Q260222",
            customerName: "Linked Customer",
            jobAddress: "22 Glass Street",
            quoteValueExcludingGst: "7000.00",
            projectComplexity: "normal",
            latestActivityAt: null,
            convertedAt: new Date("2026-07-20T06:00:00Z"),
            workOrderId: "work-order-1",
          },
          {
            id: "converted-unmatched",
            jobNumber: "Q260223",
            customerName: "Unmatched Customer",
            jobAddress: "23 Glass Street",
            quoteValueExcludingGst: "8000.00",
            projectComplexity: "tight",
            latestActivityAt: null,
            convertedAt: new Date("2026-07-20T07:00:00Z"),
            workOrderId: null,
          },
        ]}
        selectedControls={{
          search: "",
          projectComplexity: "all",
          lifecycle: "converted",
          sort: "latest_activity",
        }}
        updateComplexityAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Q260222" })).toHaveAttribute(
      "href",
      "/quote-movement/converted-linked",
    );
    expect(
      screen.getByRole("link", { name: "Open Work Order" }),
    ).toHaveAttribute("href", "/work-orders/work-order-1");
    expect(
      screen.getByText("Work Order record not yet available"),
    ).toBeVisible();
  });
});
