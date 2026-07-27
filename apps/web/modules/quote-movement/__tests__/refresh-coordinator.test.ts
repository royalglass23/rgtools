// @vitest-environment node

import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";

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
  db: { execute, transaction },
}));

import { quoteMovementRefreshCoordinator } from "../refresh-coordinator";

describe("quoteMovementRefreshCoordinator", () => {
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
});
