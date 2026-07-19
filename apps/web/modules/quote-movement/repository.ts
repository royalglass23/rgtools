import { notInArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  quoteMovementRecords,
  quoteMovementRefreshRuns,
} from '@rgtools/db/schema-quote-movement'
import type { QuoteMovementSnapshotRepository } from './sync'

export const quoteMovementSnapshotRepository: QuoteMovementSnapshotRepository = {
  async replaceActiveSnapshot(records, context) {
    const seenJobUuids = records.map((record) => record.servicem8JobUuid)

    await db.transaction(async (tx) => {
      for (const record of records) {
        await tx
          .insert(quoteMovementRecords)
          .values({
            ...record,
            servicem8Active: true,
            updatedAt: context.refreshedAt,
          })
          .onConflictDoUpdate({
            target: quoteMovementRecords.servicem8JobUuid,
            set: {
              servicem8CompanyUuid: record.servicem8CompanyUuid,
              servicem8Status: record.servicem8Status,
              servicem8Active: true,
              jobNumber: record.jobNumber,
              customerName: record.customerName,
              jobAddress: record.jobAddress,
              quoteValueExcludingGst: record.quoteValueExcludingGst,
              sourceUpdatedAt: record.sourceUpdatedAt,
              lastServiceM8SyncedAt: record.lastServiceM8SyncedAt,
              updatedAt: context.refreshedAt,
            },
          })
      }

      await tx
        .update(quoteMovementRecords)
        .set({ servicem8Active: false, updatedAt: context.refreshedAt })
        .where(
          seenJobUuids.length > 0
            ? notInArray(quoteMovementRecords.servicem8JobUuid, seenJobUuids)
            : undefined,
        )

      await tx.insert(quoteMovementRefreshRuns).values({
        actorId: context.actorId,
        status: 'success',
        syncedCount: records.length,
        createdAt: context.refreshedAt,
      })
    })
  },

  async recordFailure(message, context) {
    await db.insert(quoteMovementRefreshRuns).values({
      actorId: context.actorId,
      status: 'failed',
      errorMessage: message,
      createdAt: context.refreshedAt,
    })
  },
}
