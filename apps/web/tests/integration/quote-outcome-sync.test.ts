// Uses connection-local temporary tables; no persistent quote or audit records are changed.
import { expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quotes, auditLog } from '@rgtools/db/schema'
import { syncTrackedQuoteOutcome } from '@/modules/quote-tracker/servicem8-outcome'

it('persists ServiceM8 transitions atomically and deduplicates outcome audits in isolated temporary tables', async () => {
  if (process.env.DB_URL_PROD && process.env.DATABASE_URL === process.env.DB_URL_PROD) throw new Error('Use a nonproduction database')
  const uuid = '01a11890-73f9-7dbb-a2ab-35ed36ed866b'
  const rollback = new Error('test rollback')
  await expect(db.transaction(async (tx) => {
    await tx.execute(sql`create temporary table quotes (like public.quotes including defaults) on commit drop`)
    await tx.execute(sql`create temporary table audit_log (like public.audit_log including defaults) on commit drop`)
    await tx.insert(quotes).values({ servicem8Uuid: uuid, clientName: 'Temporary outcome test' })
    let jobStatus = 'Work Order'
    const request = async () => ({ ok: true, status: 200, json: async () => ({ uuid, status: jobStatus }) })
    const store = { select: tx.select.bind(tx), transaction: tx.transaction.bind(tx) }
    for (const [status, outcome] of [['Work Order', 'won'], ['Completed', 'won'], ['Unsuccessful', 'lost'], ['Quote', null]] as const) {
      jobStatus = status
      await syncTrackedQuoteOutcome(uuid, { request, store })
      const [quote] = await tx.select().from(quotes)
      expect(quote.outcome).toBe(outcome)
      expect(quote.archivedAt).toBeNull()
    }
    const audits = await tx.select().from(auditLog)
    expect(audits).toHaveLength(3)
    expect(audits.every((audit) => audit.action === 'quote.outcome_synced')).toBe(true)
    throw rollback
  })).rejects.toBe(rollback)
}, 30_000)
