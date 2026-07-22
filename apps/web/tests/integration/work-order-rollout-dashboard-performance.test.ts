// @vitest-environment node

import { neon } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  workOrderExistingItemRolloutRuns,
  workOrderItems,
  workOrders,
} from '@rgtools/db/schema-workorders'
import {
  readWorkOrderAcceptanceDatabaseProof,
  verifyWorkOrderAcceptanceDatabase,
} from '@/tests/e2e/work-order-acceptance-safety'
import { getLatestExistingItemRolloutStatus } from '@/modules/work-orders/existing-item-rollout'
import { createExistingItemRolloutStore } from '@/modules/work-orders/existing-item-rollout-store'
import { parseWorkOrderListFilters } from '@/modules/work-orders/list-filters'
import { loadProductionSpecificationCatalogue } from '@/modules/work-orders/production-specification-catalogue'
import {
  getWorkOrderFilterOptions,
  getWorkOrderRefreshStatus,
  listWorkOrders,
} from '@/modules/work-orders/queries'
import { getWorkOrderSpecificationFilterConfig } from '@/modules/work-orders/specification-filter-config'
import { getWorkOrderSummaryConfig } from '@/modules/work-orders/summary-config'

const isolatedDatabaseUrl = process.env.E2E_DATABASE_URL
const expectedDatabaseSentinel = process.env.E2E_DATABASE_SENTINEL
const describeWithIsolatedDatabase = isolatedDatabaseUrl ? describe : describe.skip
const workOrderId = '20800000-0000-4000-8000-000000000100'
const rolloutRunId = '20800000-0000-4000-8000-000000000101'

describeWithIsolatedDatabase('Work Orders rollout dashboard performance', () => {
  beforeAll(async () => {
    if (!isolatedDatabaseUrl) return
    const sql = neon(isolatedDatabaseUrl)
    await verifyWorkOrderAcceptanceDatabase({
      expectedSentinel: expectedDatabaseSentinel,
      readProof: () => readWorkOrderAcceptanceDatabaseProof((statement) =>
        sql.query(statement) as Promise<Array<{ databaseName: string; sentinel: string | null }>>),
    })

    await db.delete(workOrderExistingItemRolloutRuns).where(eq(workOrderExistingItemRolloutRuns.id, rolloutRunId))
    await db.delete(workOrders).where(eq(workOrders.id, workOrderId))
    await db.insert(workOrders).values({
      id: workOrderId,
      identityKind: 'servicem8_uuid',
      identityValue: `dashboard-performance-${workOrderId}`,
      servicem8Status: 'Work Order',
      clientName: 'Dashboard Performance Client',
      companyName: 'Performance Glass Ltd',
      jobNumber: `PERF-${workOrderId.slice(0, 8)}`,
      jobAddress: '100 Performance Lane, Auckland',
      isCurrent: true,
    })
    await db.insert(workOrderItems).values(Array.from({ length: 100 }, (_, index) => ({
      id: crypto.randomUUID(),
      workOrderId,
      servicem8ItemUuid: `performance-item-${index + 1}-${workOrderId}`,
      servicem8JobUuid: `performance-job-${workOrderId}`,
      itemCode: `GLASS-${String(index + 1).padStart(3, '0')}`,
      quantity: index % 3 === 0 ? '2' : '1',
      originalDescription: `Realistic glass item ${index + 1} with measured opening and hardware notes`,
      isActive: true,
    })))
    await db.insert(workOrderExistingItemRolloutRuns).values({
      id: rolloutRunId,
      correlationId: `dashboard-performance-${rolloutRunId}`,
      state: 'completed',
      totalCount: 100,
      draftedCount: 100,
      needsReviewCount: 100,
      completedAt: new Date(),
      startedAt: new Date(Date.now() - 1_000),
    })
  })

  afterAll(async () => {
    await db.delete(workOrderExistingItemRolloutRuns).where(eq(workOrderExistingItemRolloutRuns.id, rolloutRunId))
    await db.delete(workOrders).where(eq(workOrders.id, workOrderId))
  })

  it('keeps five warmed public dashboard query medians within the 10-percent rollout budget', async () => {
    if (!isolatedDatabaseUrl) throw new Error('The isolated Work Orders database is required.')
    const sql = neon(isolatedDatabaseUrl)
    const databaseMetadata = await sql`
      SELECT
        current_database() AS "databaseName",
        current_setting('neon.branch_id', true) AS "databaseBranch"
    ` as Array<{ databaseName: string; databaseBranch: string | null }>
    const catalogue = await loadProductionSpecificationCatalogue()
    const filters = parseWorkOrderListFilters({ size: '5' })
    const baselineQuery = () => Promise.all([
      listWorkOrders(filters, catalogue),
      getWorkOrderFilterOptions(),
      getWorkOrderSummaryConfig(),
      getWorkOrderRefreshStatus(),
      getWorkOrderSpecificationFilterConfig(),
    ])
    const rolloutQuery = () => Promise.all([
      ...[baselineQuery()],
      getLatestExistingItemRolloutStatus({ store: createExistingItemRolloutStore() }),
    ])

    await baselineQuery()
    await rolloutQuery()
    const baselineSamples: number[] = []
    const rolloutSamples: number[] = []
    for (let run = 0; run < 5; run += 1) {
      baselineSamples.push(await measure(baselineQuery))
      rolloutSamples.push(await measure(rolloutQuery))
    }

    const baselineMedian = median(baselineSamples)
    const rolloutMedian = median(rolloutSamples)
    console.log(JSON.stringify({
      fixture: 'one current Work Order with 100 active realistic items',
      baselineSamplesMs: baselineSamples,
      rolloutSamplesMs: rolloutSamples,
      baselineMedianMs: baselineMedian,
      rolloutMedianMs: rolloutMedian,
      regressionPercent: ((rolloutMedian / baselineMedian) - 1) * 100,
      databaseName: databaseMetadata[0]?.databaseName,
      databaseBranch: databaseMetadata[0]?.databaseBranch,
      runner: `${process.platform} node-${process.version}`,
    }))
    expect(rolloutMedian).toBeLessThanOrEqual(baselineMedian * 1.1)
  }, 120_000)
})

async function measure(operation: () => Promise<unknown>) {
  const startedAt = performance.now()
  await operation()
  return performance.now() - startedAt
}

function median(samples: number[]) {
  return [...samples].sort((left, right) => left - right)[2]
}
