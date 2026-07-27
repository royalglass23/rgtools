// @vitest-environment node

import { inspect } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
const updateWhere = vi.hoisted(() => vi.fn());
const updateSet = vi.hoisted(() => vi.fn(() => ({ where: updateWhere })));
const update = vi.hoisted(() => vi.fn(() => ({ set: updateSet })));
const insertValues = vi.hoisted(() => vi.fn());
const insert = vi.hoisted(() => vi.fn(() => ({ values: insertValues })));
const transaction = vi.hoisted(() =>
  vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({ update, insert }),
  ),
);

vi.mock("@/lib/db", () => ({
  db: { execute, transaction, update },
}));

import { quoteMovementRefreshCoordinator } from "../refresh-coordinator";

describe("quoteMovementRefreshCoordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes abandoned parent and per-job rows before accepting a new refresh", async () => {
    execute.mockResolvedValue({ rows: [{ lock_name: "quote-movement-refresh" }] });

    await expect(
      quoteMovementRefreshCoordinator.request("user-1"),
    ).resolves.toMatchObject({ accepted: true });

    const abandonedStatusCondition = updateWhere.mock.calls[0]?.[0];
    const condition = inspect(abandonedStatusCondition.queryChunks, {
      depth: 3,
    });
    expect(condition).toContain("queued");
    expect(condition).toContain("fetching");
  });

  it("finalizes per-job rows when a batch completes", async () => {
    await quoteMovementRefreshCoordinator.complete?.("batch-1", [
      { jobNumber: "Q260101", status: "fetched" },
      { jobNumber: "Q260102", status: "failed", message: "ServiceM8 unavailable" },
    ]);

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: "fetched",
      syncedCount: 1,
      completedAt: expect.any(Date),
    }));
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      syncedCount: 0,
      errorMessage: "ServiceM8 unavailable",
      completedAt: expect.any(Date),
    }));
  });
});
