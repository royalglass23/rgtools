// @vitest-environment node

import { describe, expect, it } from "vitest";
import { deriveQuoteMovementRefreshStatus } from "../queries";

describe("deriveQuoteMovementRefreshStatus", () => {
  it("uses successful completion time for Last refreshed and ignores request time", () => {
    const completedAt = new Date("2026-07-21T01:05:00Z");

    expect(
      deriveQuoteMovementRefreshStatus({
        successful: {
          createdAt: new Date("2026-07-21T01:00:00Z"),
          completedAt,
          syncedCount: 3,
        },
        failed: null,
        pending: null,
        now: new Date("2026-07-21T01:10:00Z"),
      }),
    ).toMatchObject({
      lastSuccessfulAt: completedAt,
      lastSuccessfulCount: 3,
      isPending: false,
      isStale: false,
    });
  });

  it("reports durable pending and stale state without discarding the last success", () => {
    const lastSuccessfulAt = new Date("2026-07-21T00:00:00Z");
    const pendingSince = new Date("2026-07-21T01:00:00Z");

    expect(
      deriveQuoteMovementRefreshStatus({
        successful: {
          createdAt: lastSuccessfulAt,
          completedAt: lastSuccessfulAt,
          syncedCount: 2,
        },
        failed: null,
        pending: { createdAt: pendingSince },
        now: new Date("2026-07-21T01:01:00Z"),
      }),
    ).toMatchObject({
      lastSuccessfulAt,
      pendingSince,
      isPending: true,
      isStale: true,
    });
  });

  it("stops blocking refresh after a pending run has exceeded its lease window", () => {
    const pendingSince = new Date("2026-07-21T00:00:00Z");

    expect(
      deriveQuoteMovementRefreshStatus({
        successful: null,
        failed: null,
        pending: { createdAt: pendingSince },
        now: new Date("2026-07-21T00:16:00Z"),
      }),
    ).toMatchObject({
      pendingSince: null,
      isPending: false,
      hasExpiredPending: true,
      isStale: true,
    });
  });

  it("surfaces only a failure newer than the last valid refresh", () => {
    const failureAt = new Date("2026-07-21T01:06:00Z");

    expect(
      deriveQuoteMovementRefreshStatus({
        successful: {
          createdAt: new Date("2026-07-21T01:00:00Z"),
          completedAt: new Date("2026-07-21T01:05:00Z"),
          syncedCount: 2,
        },
        failed: {
          createdAt: new Date("2026-07-21T01:01:00Z"),
          completedAt: failureAt,
          errorMessage: "Quote Movement refresh failed safely.",
        },
        pending: null,
        now: new Date("2026-07-21T01:07:00Z"),
      }).latestFailure,
    ).toEqual({
      at: failureAt,
      message: "Quote Movement refresh failed safely.",
    });
  });
});
