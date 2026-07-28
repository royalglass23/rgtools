import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuoteMovementSummaryRecovery } from "../QuoteMovementSummaryRecovery";

describe("QuoteMovementSummaryRecovery", () => {
  it("offers a retry action when the summary failed", async () => {
    const retry = vi.fn(async () => undefined);
    const user = userEvent.setup();

    render(
      <QuoteMovementSummaryRecovery
        recordId="record-1"
        error="What Matters Now could not update."
        retryAction={retry}
      />,
    );

    expect(screen.getByText("What Matters Now could not update.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry summary" }));
    expect(retry).toHaveBeenCalledWith("record-1");
  });
});
