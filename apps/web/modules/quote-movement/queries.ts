import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  quoteMovementRecords,
  quoteMovementRefreshRuns,
} from '@rgtools/db/schema-quote-movement'

export async function listActiveQuoteMovementRecords() {
  return db
    .select()
    .from(quoteMovementRecords)
    .where(and(
      eq(quoteMovementRecords.servicem8Active, true),
      eq(quoteMovementRecords.servicem8Status, 'Quote'),
    ))
    .orderBy(
      sql`${quoteMovementRecords.sourceUpdatedAt} desc nulls last`,
      asc(quoteMovementRecords.customerName),
      asc(quoteMovementRecords.id),
    )
}

export async function getQuoteMovementRecord(id: string) {
  const [record] = await db
    .select()
    .from(quoteMovementRecords)
    .where(eq(quoteMovementRecords.id, id))
    .limit(1)

  return record ?? null
}

export async function getQuoteMovementRefreshStatus() {
  const [successfulRows, failedRows] = await Promise.all([
    db
      .select({
        createdAt: quoteMovementRefreshRuns.createdAt,
        syncedCount: quoteMovementRefreshRuns.syncedCount,
      })
      .from(quoteMovementRefreshRuns)
      .where(eq(quoteMovementRefreshRuns.status, 'success'))
      .orderBy(desc(quoteMovementRefreshRuns.createdAt))
      .limit(1),
    db
      .select({
        createdAt: quoteMovementRefreshRuns.createdAt,
        errorMessage: quoteMovementRefreshRuns.errorMessage,
      })
      .from(quoteMovementRefreshRuns)
      .where(eq(quoteMovementRefreshRuns.status, 'failed'))
      .orderBy(desc(quoteMovementRefreshRuns.createdAt))
      .limit(1),
  ])
  const latestSuccess = successfulRows[0] ?? null
  const latestFailure = failedRows[0] ?? null
  const hasNewerFailure = latestFailure && (
    !latestSuccess || latestFailure.createdAt.getTime() > latestSuccess.createdAt.getTime()
  )

  return {
    lastSuccessfulAt: latestSuccess?.createdAt ?? null,
    lastSuccessfulCount: latestSuccess?.syncedCount ?? 0,
    latestFailure: hasNewerFailure
      ? {
          at: latestFailure.createdAt,
          message: latestFailure.errorMessage ?? 'Quote Movement refresh failed.',
        }
      : null,
  }
}
