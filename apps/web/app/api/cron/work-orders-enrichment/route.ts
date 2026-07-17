import { createWorkOrderEnrichmentRuntimeStore } from '@/modules/work-orders/enrichment-runtime-store'
import { processWorkOrderEnrichmentBatch } from '@/modules/work-orders/enrichment-worker'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processWorkOrderEnrichmentBatch({
      store: createWorkOrderEnrichmentRuntimeStore(),
      concurrency: 3,
      timeoutMs: 30_000,
      leaseMs: 60_000,
      maxAttempts: 3,
    })
    return Response.json({ ok: true, ...result })
  } catch {
    return Response.json(
      { ok: false, error: 'Work Order enrichment worker failed.' },
      { status: 500 },
    )
  }
}
