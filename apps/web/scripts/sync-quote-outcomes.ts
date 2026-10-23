import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
config({ path: fileURLToPath(new URL('../../../.env.local', import.meta.url)), quiet: true })

async function main() {
  const { db } = await import('../lib/db')
  const { quotes } = await import('@rgtools/db/schema')
  const { asc, gt } = await import('drizzle-orm')
  const { syncTrackedQuoteOutcome } = await import('../modules/quote-tracker/servicem8-outcome')
  const apply = process.argv.includes('--apply')
  let cursor: string | undefined
  const totals = { changed: 0, unchanged: 0, untracked: 0, failed: 0 }
  for (;;) {
    const rows = await db.select({ id: quotes.id, jobUuid: quotes.servicem8Uuid }).from(quotes)
      .where(cursor ? gt(quotes.id, cursor) : undefined).orderBy(asc(quotes.id)).limit(50)
    if (!rows.length) break
    for (const row of rows) {
      try {
        const result = await syncTrackedQuoteOutcome(row.jobUuid, { dryRun: !apply })
        totals[result.status] += 1
      } catch {
        totals.failed += 1
        console.error(`Could not sync quote ${row.id}; existing outcome kept`)
      }
    }
    cursor = rows[rows.length - 1].id
  }
  console.log({ mode: apply ? 'apply' : 'dry-run', ...totals })
  if (totals.failed) process.exitCode = 1
}

main().catch(() => { console.error('Quote outcome sync failed'); process.exitCode = 1 })
