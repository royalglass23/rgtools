import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  quoteMovementRecords,
  quoteMovementRefreshRuns,
  quoteMovementSourceEnrichment,
  quoteMovementSources,
} from '@rgtools/db/schema-quote-movement'
import type { QuoteMovementProjectComplexity } from '@rgtools/db/schema-quote-movement'
import { workOrders } from '@rgtools/db/schema-workorders'

export type QuoteMovementListFilters = {
  search?: string
  projectComplexity?: QuoteMovementProjectComplexity
  lifecycle?: 'active' | 'converted'
  sort?: 'latest_activity' | 'quote_value' | 'customer'
}

export async function listQuoteMovementRecords(
  filters: QuoteMovementListFilters = {},
) {
  const search = filters.search?.trim()
  const conditions =
    filters.lifecycle === 'converted'
      ? [isNotNull(quoteMovementRecords.convertedAt)]
      : [
          isNull(quoteMovementRecords.convertedAt),
          eq(quoteMovementRecords.servicem8Active, true),
          eq(quoteMovementRecords.servicem8Status, 'Quote'),
        ]
  if (search) {
    conditions.push(
      or(
        ilike(quoteMovementRecords.jobNumber, `%${search}%`),
        ilike(quoteMovementRecords.customerName, `%${search}%`),
        ilike(quoteMovementRecords.jobAddress, `%${search}%`),
      )!,
    )
  }
  if (filters.projectComplexity) {
    conditions.push(
      eq(quoteMovementRecords.projectComplexity, filters.projectComplexity),
    )
  }
  const orderBy =
    filters.sort === 'quote_value'
      ? [
          sql`${quoteMovementRecords.quoteValueExcludingGst} desc nulls last`,
          asc(quoteMovementRecords.customerName),
          asc(quoteMovementRecords.id),
        ]
      : filters.sort === 'customer'
        ? [asc(quoteMovementRecords.customerName), asc(quoteMovementRecords.id)]
        : [
            sql`${quoteMovementRecords.latestActivityAt} desc nulls last`,
            asc(quoteMovementRecords.customerName),
            asc(quoteMovementRecords.id),
          ]

  return db
    .select({
      ...getTableColumns(quoteMovementRecords),
      workOrderId: workOrders.id,
    })
    .from(quoteMovementRecords)
    .leftJoin(
      workOrders,
      and(
        eq(workOrders.servicem8JobUuid, quoteMovementRecords.servicem8JobUuid),
        eq(workOrders.servicem8Status, 'Work Order'),
        eq(workOrders.isCurrent, true),
      ),
    )
    .where(and(...conditions))
    .orderBy(...orderBy)
}

export async function listActiveQuoteMovementRecords() {
  return listQuoteMovementRecords()
}

export async function getQuoteMovementRecord(id: string) {
  const [record] = await db
    .select({
      ...getTableColumns(quoteMovementRecords),
      workOrderId: workOrders.id,
    })
    .from(quoteMovementRecords)
    .leftJoin(
      workOrders,
      and(
        eq(workOrders.servicem8JobUuid, quoteMovementRecords.servicem8JobUuid),
        eq(workOrders.servicem8Status, 'Work Order'),
        eq(workOrders.isCurrent, true),
      ),
    )
    .where(eq(quoteMovementRecords.id, id))
    .limit(1)

  return record ?? null
}

export async function getQuoteMovementEvidence(
  recordId: string,
  sourceIdentity: string,
) {
  const [evidence] = await db
    .select({
      recordId: quoteMovementRecords.id,
      jobNumber: quoteMovementRecords.jobNumber,
      customerName: quoteMovementRecords.customerName,
      sourceType: quoteMovementSources.sourceType,
      occurredAt: quoteMovementSources.occurredAt,
      content: quoteMovementSources.content,
      interpretationStatus: quoteMovementSourceEnrichment.interpretationStatus,
      interpretationSummary: quoteMovementSourceEnrichment.summary,
    })
    .from(quoteMovementSources)
    .innerJoin(
      quoteMovementRecords,
      eq(quoteMovementRecords.id, quoteMovementSources.quoteMovementRecordId),
    )
    .leftJoin(
      quoteMovementSourceEnrichment,
      eq(quoteMovementSourceEnrichment.sourceId, quoteMovementSources.id),
    )
    .where(
      and(
        eq(quoteMovementRecords.id, recordId),
        eq(quoteMovementSources.sourceIdentity, sourceIdentity),
      ),
    )
    .limit(1)

  return evidence ?? null
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
  const hasNewerFailure =
    latestFailure &&
    (!latestSuccess ||
      latestFailure.createdAt.getTime() > latestSuccess.createdAt.getTime())

  return {
    lastSuccessfulAt: latestSuccess?.createdAt ?? null,
    lastSuccessfulCount: latestSuccess?.syncedCount ?? 0,
    latestFailure: hasNewerFailure
      ? {
          at: latestFailure.createdAt,
          message:
            latestFailure.errorMessage ?? 'Quote Movement refresh failed.',
        }
      : null,
  }
}
