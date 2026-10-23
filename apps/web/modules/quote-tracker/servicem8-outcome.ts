import { and, eq, sql } from 'drizzle-orm'
import { quotes } from '@rgtools/db/schema'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit-db'
import { createServiceM8RequestFromEnv, type ServiceM8FetchRequest } from '@/lib/servicem8/client'

export type QuoteOutcome = 'won' | 'lost' | null

export function outcomeFromJobStatus(status: unknown): QuoteOutcome | undefined {
  if (typeof status !== 'string') return undefined
  switch (status.trim().toLowerCase()) {
    case 'work order':
    case 'completed': return 'won'
    case 'unsuccessful': return 'lost'
    case 'quote': return null
    default: return undefined
  }
}

export async function syncTrackedQuoteOutcome(jobUuid: string, options: {
  request?: ServiceM8FetchRequest
  dryRun?: boolean
  store?: Pick<typeof db, 'select' | 'transaction'>
} = {}) {
  const store = options.store ?? db
  const [quote] = await store.select({
    id: quotes.id, outcome: quotes.outcome,
    // Keep PostgreSQL precision for the optimistic concurrency check.
    version: sql<string>`${quotes.updatedAt}::text`,
  }).from(quotes).where(eq(quotes.servicem8Uuid, jobUuid)).limit(1)
  if (!quote) return { status: 'untracked' as const }

  const request = options.request ?? createServiceM8RequestFromEnv({ timeoutMs: 4000, retry: { maxAttempts: 1 } })
  const job = await readJobWithinDeadline(jobUuid, request)
  if (!job || typeof job !== 'object' || Array.isArray(job)) throw new Error('Invalid ServiceM8 job')
  const record = job as { uuid?: unknown; status?: unknown }
  if (typeof record.uuid !== 'string' || record.uuid.toLowerCase() !== jobUuid.toLowerCase()) {
    throw new Error('ServiceM8 job identity mismatch')
  }
  const outcome = outcomeFromJobStatus(record.status)
  if (outcome === undefined) throw new Error('Unrecognised ServiceM8 job status')
  const changed = outcome !== quote.outcome
  if (!options.dryRun) {
    await store.transaction(async (tx) => {
      // Advance the version even for unchanged outcomes, so a slower older read must retry.
      const updated = await tx.update(quotes).set({ outcome, updatedAt: sql`clock_timestamp()` })
        .where(and(eq(quotes.id, quote.id), sql`${quotes.updatedAt}::text = ${quote.version}`))
        .returning({ id: quotes.id })
      if (updated.length !== 1) throw new Error('Quote changed during status sync; retry')
      if (changed) await logAudit({
        entityType: 'quote', action: 'quote.outcome_synced', targetId: quote.id,
        detail: { source: 'servicem8', jobUuid, jobStatus: record.status, previousOutcome: quote.outcome, outcome },
      }, tx)
    })
  }
  return { status: changed ? 'changed' as const : 'unchanged' as const, outcome }
}

async function readJobWithinDeadline(jobUuid: string, request: ServiceM8FetchRequest): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        const response = await request(`/job/${encodeURIComponent(jobUuid)}.json`)
        if (!response.ok) throw new Error('ServiceM8 status lookup failed')
        return response.json()
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('ServiceM8 status lookup timed out')), 4000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
