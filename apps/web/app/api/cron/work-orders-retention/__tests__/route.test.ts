// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cleanupExpiredWorkOrderDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/work-orders/retention", () => ({
  cleanupExpiredWorkOrderData: cleanupExpiredWorkOrderDataMock,
}));

import { GET } from "../route";

const previousCronSecret = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  cleanupExpiredWorkOrderDataMock.mockResolvedValue({
    workOrdersDeleted: 1,
    eventsDeleted: 2,
    refreshRunsDeleted: 3,
  });
});

afterEach(() => {
  if (previousCronSecret === undefined) {
    delete process.env.CRON_SECRET;
    return;
  }
  process.env.CRON_SECRET = previousCronSecret;
});

describe("GET /api/cron/work-orders-retention", () => {
  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request("test-cron-secret"));

    expect(response.status).toBe(401);
    expect(cleanupExpiredWorkOrderDataMock).not.toHaveBeenCalled();
  });

  it("rejects a request whose bearer secret does not match", async () => {
    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(cleanupExpiredWorkOrderDataMock).not.toHaveBeenCalled();
  });

  it("runs retention cleanup for an authorized Vercel cron request", async () => {
    const response = await GET(request("test-cron-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      workOrdersDeleted: 1,
      eventsDeleted: 2,
      refreshRunsDeleted: 3,
    });
    expect(cleanupExpiredWorkOrderDataMock).toHaveBeenCalledOnce();
  });

  it("returns a safe error when cleanup fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    cleanupExpiredWorkOrderDataMock.mockRejectedValueOnce(
      new Error("database detail"),
    );

    const response = await GET(request("test-cron-secret"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Work Order retention cleanup failed.",
    });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});

function request(secret: string) {
  return new Request("https://rgtools.local/api/cron/work-orders-retention", {
    headers: { authorization: `Bearer ${secret}` },
  });
}
