import { cleanupExpiredWorkOrderData } from "@/modules/work-orders/retention";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await cleanupExpiredWorkOrderData();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Work Order retention cron failed.", error);
    return Response.json(
      { ok: false, error: "Work Order retention cleanup failed." },
      { status: 500 },
    );
  }
}
