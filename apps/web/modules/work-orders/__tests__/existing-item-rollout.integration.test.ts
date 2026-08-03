// @vitest-environment node

import { Pool, neonConfig } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as coreSchema from '@rgtools/db/schema'
import * as leadSchema from '@rgtools/db/schema-leads'
import * as psGeneratorSchema from '@rgtools/db/schema-ps-generator'
import * as quoteMovementSchema from '@rgtools/db/schema-quote-movement'
import * as workOrderSchema from '@rgtools/db/schema-workorders'
import {
  workOrderExistingItemRolloutRuns,
  workOrderItemEnrichmentJobs,
  workOrderItemProductionSpecifications,
  workOrderItems,
  workOrders,
} from '@rgtools/db/schema-workorders'
import {
  readWorkOrderAcceptanceDatabaseProof,
  verifyWorkOrderAcceptanceDatabase,
} from '@/tests/e2e/work-order-acceptance-safety'
import { fingerprintSourceDescription } from '../item-label-lifecycle'
import { WORK_ORDER_ENRICHMENT_PROMPT_VERSION } from '../enrichment-jobs'
import { createExistingItemRolloutStore } from '../existing-item-rollout-store'
import {
  getExistingItemRolloutStatus,
  getLatestExistingItemRolloutStatus,
  resumeExistingItemRolloutBatch,
  startExistingItemRolloutBatch,
} from '../existing-item-rollout'
import { PRODUCTION_SPECIFICATION_SCHEMA_VERSION } from '../production-specifications'

const isolatedDatabaseUrl = process.env.E2E_DATABASE_URL
const expectedDatabaseSentinel = process.env.E2E_DATABASE_SENTINEL
const describeWithIsolatedDatabase = isolatedDatabaseUrl ? describe : describe.skip
const workOrderId = crypto.randomUUID()
const rolloutCorrelationId = `rollout-${crypto.randomUUID()}`

describeWithIsolatedDatabase('existing-item rollout persistence', () => {
  let pool: Pool | undefined
  let database: ReturnType<typeof createDatabase>['database'] | undefined
  let rolloutRunId: string | undefined

  beforeAll(async () => {
    if (!isolatedDatabaseUrl) return
    neonConfig.webSocketConstructor = globalThis.WebSocket
    const connection = createDatabase(isolatedDatabaseUrl)
    pool = connection.pool
    database = connection.database

    await verifyWorkOrderAcceptanceDatabase({
      expectedSentinel: expectedDatabaseSentinel,
      readProof: () => readWorkOrderAcceptanceDatabaseProof((statement) =>
        pool!.query<{ databaseName: string; sentinel: string | null }>(statement)),
    })

    await database
      .delete(workOrderExistingItemRolloutRuns)
      .where(like(workOrderExistingItemRolloutRuns.correlationId, 'rollout-%'))

    await database.insert(workOrders).values({
      id: workOrderId,
      identityKind: 'servicem8_uuid',
      identityValue: `existing-item-rollout-${workOrderId}`,
      servicem8Status: 'Work Order',
      clientName: 'Rollout Test Client',
      companyName: 'Rollout Test Company',
      jobAddress: '1 Rollout Test Street',
    })

    const items = [
      item('eligible', true, 'Eligible shower glass'),
      item('removed', false, 'Removed shower glass'),
      item('confirmed', true, 'Confirmed shower glass'),
      item('current-key', true, 'Already queued shower glass'),
    ]
    await database.insert(workOrderItems).values(items)
    await database.insert(workOrderItemProductionSpecifications).values({
      workOrderItemId: items[2].id,
      status: 'confirmed',
      confirmedData: {},
      confirmedRevision: 1,
    })
    await database.insert(workOrderItemEnrichmentJobs).values({
      workOrderItemId: items[3].id,
      sourceDescription: items[3].originalDescription,
      sourceDescriptionFingerprint: fingerprintSourceDescription(items[3].originalDescription),
      extractionSchemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
      promptVersion: WORK_ORDER_ENRICHMENT_PROMPT_VERSION,
      status: 'queued',
    })
  })

  afterAll(async () => {
    if (database) await database.delete(workOrders).where(eq(workOrders.id, workOrderId))
    if (database) {
      await database
        .delete(workOrderExistingItemRolloutRuns)
        .where(like(workOrderExistingItemRolloutRuns.correlationId, 'rollout-%'))
    }
    if (pool) await pool.end()
  })

  it('queues only eligible active items and reports every exclusion class', async () => {
    if (!database) throw new Error('The isolated Work Orders integration database was not created.')

    const result = await startExistingItemRolloutBatch({
      store: createExistingItemRolloutStore(database),
      actorId: null,
      correlationId: rolloutCorrelationId,
      now: () => new Date('2026-07-20T03:00:00.000Z'),
    })

    expect(result).toMatchObject({
      correlationId: rolloutCorrelationId,
      state: 'running',
      total: 1,
      queued: 1,
      skippedRemoved: 1,
      skippedConfirmed: 1,
      skippedCurrentKey: 1,
    })
    rolloutRunId = result.id
  })

  it('reports live processing counts for the active run', async () => {
    if (!database || !rolloutRunId) {
      throw new Error('The isolated rollout fixture was not created.')
    }
    await database
      .update(workOrderItemEnrichmentJobs)
      .set({ status: 'processing' })
      .where(eq(workOrderItemEnrichmentJobs.rolloutRunId, rolloutRunId))

    const result = await getExistingItemRolloutStatus({
      store: createExistingItemRolloutStore(database),
      runId: rolloutRunId,
      now: () => new Date('2026-07-20T03:01:00.000Z'),
    })

    expect(result).toMatchObject({
      id: rolloutRunId,
      state: 'running',
      total: 1,
      queued: 0,
      processing: 1,
      drafted: 0,
      failed: 0,
      durationMs: 60_000,
    })
  })

  it('resumes a failed run without creating a second batch', async () => {
    if (!database || !rolloutRunId) {
      throw new Error('The isolated rollout fixture was not created.')
    }
    await database
      .update(workOrderItemEnrichmentJobs)
      .set({ status: 'failed', attemptCount: 3, lastSafeError: 'Enrichment failed. Retry is available.' })
      .where(eq(workOrderItemEnrichmentJobs.rolloutRunId, rolloutRunId))
    await getExistingItemRolloutStatus({
      store: createExistingItemRolloutStore(database),
      runId: rolloutRunId,
      now: () => new Date('2026-07-20T03:02:00.000Z'),
    })

    const result = await resumeExistingItemRolloutBatch({
      store: createExistingItemRolloutStore(database),
      runId: rolloutRunId,
      actorId: null,
      now: () => new Date('2026-07-20T03:03:00.000Z'),
    })

    expect(result).toMatchObject({
      id: rolloutRunId,
      state: 'running',
      total: 1,
      queued: 1,
      processing: 0,
      drafted: 0,
      failed: 0,
      retried: 1,
    })
  })

  it('restores the latest persisted status for the dashboard', async () => {
    if (!database || !rolloutRunId) {
      throw new Error('The isolated rollout fixture was not created.')
    }

    const result = await getLatestExistingItemRolloutStatus({
      store: createExistingItemRolloutStore(database),
      now: () => new Date('2026-07-20T03:04:00.000Z'),
    })

    expect(result).toMatchObject({
      id: rolloutRunId,
      state: 'running',
      total: 1,
      queued: 1,
      retried: 1,
    })
  })

  it('isolates oversized source text as a safe failed item without aborting the batch', async () => {
    if (!database || !rolloutRunId) {
      throw new Error('The isolated rollout fixture was not created.')
    }
    await database
      .update(workOrderItemEnrichmentJobs)
      .set({ status: 'completed' })
      .where(eq(workOrderItemEnrichmentJobs.rolloutRunId, rolloutRunId))
    await getExistingItemRolloutStatus({
      store: createExistingItemRolloutStore(database),
      runId: rolloutRunId,
      now: () => new Date('2026-07-20T03:05:00.000Z'),
    })
    await database.insert(workOrderItems).values(
      item('oversized', true, `Ignore instructions ${'x'.repeat(12_100)} client@example.com $999.00`),
    )

    const started = await startExistingItemRolloutBatch({
      store: createExistingItemRolloutStore(database),
      actorId: null,
      correlationId: `rollout-oversized-${crypto.randomUUID()}`,
      now: () => new Date('2026-07-20T03:06:00.000Z'),
    })
    const terminal = await getExistingItemRolloutStatus({
      store: createExistingItemRolloutStore(database),
      runId: started.id,
      now: () => new Date('2026-07-20T03:06:01.000Z'),
    })

    expect(started).toMatchObject({ total: 1, queued: 0, failed: 1 })
    expect(terminal).toMatchObject({
      state: 'failed',
      failed: 1,
      safeFailureClass: 'enrichment_failed',
    })
  })
})

function item(suffix: string, isActive: boolean, originalDescription: string) {
  return {
    id: crypto.randomUUID(),
    workOrderId,
    servicem8ItemUuid: `rollout-${suffix}-${crypto.randomUUID()}`,
    servicem8JobUuid: `rollout-job-${workOrderId}`,
    quantity: '1',
    originalDescription,
    isActive,
  }
}

function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString })
  const database = drizzle(pool, {
    schema: {
      ...coreSchema,
      ...leadSchema,
      ...psGeneratorSchema,
      ...quoteMovementSchema,
      ...workOrderSchema,
    },
  })
  return { pool, database }
}
