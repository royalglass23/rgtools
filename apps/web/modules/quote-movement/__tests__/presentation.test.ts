import { describe, expect, it } from "vitest";
import { formatQuoteMovementActivity } from "../presentation";

describe("formatQuoteMovementActivity", () => {
  it("makes tracked opens and downloads readable in the activity timeline", () => {
    expect(
      formatQuoteMovementActivity("tracked_open", { eventType: "open" }, null, null),
    ).toEqual({
      label: "Tracked customer open",
      preview: "Customer opened the tracked quote.",
      body: "Customer opened the tracked quote.",
    });
    expect(
      formatQuoteMovementActivity("tracked_download", { eventType: "download" }, null, null),
    ).toMatchObject({
      label: "Tracked customer download",
      preview: "Customer downloaded the tracked quote.",
    });
  });
});
