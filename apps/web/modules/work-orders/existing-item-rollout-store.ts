import { and, desc, eq, inArray } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  workOrderExistingItemRolloutRuns,
  workOrderItemEnrichmentJobs,
  workOrderItemProductionSpecifications,
  workOrderItems,
  workOrders,
} from '@rgtools/db/schema-workorders'
import { fingerprintSourceDescription } from './item-label-lifecycle'
import {
  WORK_ORDER_ENRICHMENT_PROMPT_VERSION,
} from './enrichment-jobs'
import type {
  ExistingItemRolloutStatus,
  ExistingItemRolloutResumeStore,
  ExistingItemRolloutLatestStore,
  ExistingItemRolloutStatusStore,
  ExistingItemRolloutStore,
} from './existing-item-rollout'
import { sanitizeWorkOrderEnrichmentSource } from './production-specification-enrichment'
import { PRODUCTION_SPECIFICATION_SCHEMA_VERSION } from './production-specifications'

type RolloutDatabase = Pick<typeof db, 'insert' | 'select' | 'transaction' | 'update'>

export function createExistingItemRolloutStore(
  database: RolloutDatabase = db,
): ExistingItemRolloutStore & ExistingItemRolloutStatusStore & ExistingItemRolloutResumeStore & ExistingItemRolloutLatestStore {
  return {
    async acquireRun(input) {
      const [created] = await database
        .insert(workOrderExistingItemRolloutRuns)
        .values({
          actorId: input.actorId,
          correlationId: input.correlationId,
          state: 'running',
          activeRunKey: true,
          startedAt: input.startedAt,
          updatedAt: input.startedAt,
        })
        .onConflictDoNothing()
        .returning({
          id: workOrderExistingItemRolloutRuns.id,
          correlationId: workOrderExistingItemRolloutRuns.correlationId,
          startedAt: workOrderExistingItemRolloutRuns.startedAt,
        })

      if (created) return { kind: 'created', run: created }

      const [active] = await database
        .select()
        .from(workOrderExistingItemRolloutRuns)
        .where(eq(workOrderExistingItemRolloutRuns.activeRunKey, true))
        .limit(1)
      if (!active) throw new Error('The rollout could not acquire an active run.')
      return { kind: 'existing', status: rolloutStatus(active) }
    },

    async queueEligibleItems(runId) {
      const rows = await database
        .select({
          id: workOrderItems.id,
          isActive: workOrderItems.isActive,
          originalDescription: workOrderItems.originalDescription,
          confirmedData: workOrderItemProductionSpecifications.confirmedData,
          clientName: workOrders.clientName,
          companyName: workOrders.companyName,
          jobAddress: workOrders.jobAddress,
        })
        .from(workOrderItems)
        .innerJoin(workOrders, eq(workOrders.id, workOrderItems.workOrderId))
        .leftJoin(
          workOrderItemProductionSpecifications,
          eq(workOrderItemProductionSpecifications.workOrderItemId, workOrderItems.id),
        )
        .where(and(
          eq(workOrders.isCurrent, true),
          eq(workOrders.servicem8Active, true),
          eq(workOrders.servicem8Status, 'Work Order'),
        ))

      const itemIds = rows.map((row) => row.id)
      const existingJobs = itemIds.length === 0
        ? []
        : await database
          .select({
            workOrderItemId: workOrderItemEnrichmentJobs.workOrderItemId,
            sourceDescriptionFingerprint: workOrderItemEnrichmentJobs.sourceDescriptionFingerprint,
          })
          .from(workOrderItemEnrichmentJobs)
          .where(and(
            inArray(workOrderItemEnrichmentJobs.workOrderItemId, itemIds),
            eq(
              workOrderItemEnrichmentJobs.extractionSchemaVersion,
              PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
            ),
            eq(workOrderItemEnrichmentJobs.promptVersion, WORK_ORDER_ENRICHMENT_PROMPT_VERSION),
          ))
      const currentKeys = new Set(existingJobs.map((job) => (
        `${job.workOrderItemId}:${job.sourceDescriptionFingerprint}`
      )))

      let skippedRemoved = 0
      let skippedConfirmed = 0
      let skippedCurrentKey = 0
      const values = rows.flatMap((row) => {
        if (!row.isActive) {
          skippedRemoved += 1
          return []
        }
        if (row.confirmedData) {
          skippedConfirmed += 1
          return []
        }
        const sourceDescriptionFingerprint = fingerprintSourceDescription(row.originalDescription)
        if (currentKeys.has(`${row.id}:${sourceDescriptionFingerprint}`)) {
          skippedCurrentKey += 1
          return []
        }
        let sourceDescription: string
        let status: 'queued' | 'failed' = 'queued'
        let lastSafeError: string | null = null
        try {
          sourceDescription = sanitizeWorkOrderEnrichmentSource(row.originalDescription, {
            clientNames: [row.clientName, row.companyName],
            jobAddresses: [row.jobAddress],
          })
        } catch {
          sourceDescription = '[source rejected by safety limits]'
          status = 'failed'
          lastSafeError = 'Input rejected by safety limits.'
        }
        return [{
          workOrderItemId: row.id,
          sourceDescription,
          sourceDescriptionFingerprint,
          extractionSchemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
          promptVersion: WORK_ORDER_ENRICHMENT_PROMPT_VERSION,
          status,
          lastSafeError,
          rolloutRunId: runId,
        }]
      })

      const inserted = values.length === 0
        ? []
        : await database
          .insert(workOrderItemEnrichmentJobs)
          .values(values)
          .onConflictDoNothing()
          .returning({
            id: workOrderItemEnrichmentJobs.id,
            status: workOrderItemEnrichmentJobs.status,
          })
      skippedCurrentKey += values.length - inserted.length
      const queued = inserted.filter((job) => job.status === 'queued').length
      const failed = inserted.filter((job) => job.status === 'failed').length

      return {
        total: inserted.length,
        queued,
        failed,
        skippedRemoved,
        skippedConfirmed,
        skippedCurrentKey,
      }
    },

    async recordInitialCounts(runId, counts) {
      await database
        .update(workOrderExistingItemRolloutRuns)
        .set({
          totalCount: counts.total,
          queuedCount: counts.queued,
          failedCount: counts.failed,
          skippedRemovedCount: counts.skippedRemoved,
          skippedConfirmedCount: counts.skippedConfirmed,
          skippedCurrentKeyCount: counts.skippedCurrentKey,
          updatedAt: new Date(),
        })
        .where(eq(workOrderExistingItemRolloutRuns.id, runId))
    },

    async refreshStatus(runId, observedAt) {
      const [run] = await database
        .select()
        .from(workOrderExistingItemRolloutRuns)
        .where(eq(workOrderExistingItemRolloutRuns.id, runId))
        .limit(1)
      if (!run) throw new Error('The rollout run could not be found.')

      const jobs = await database
        .select({
          status: workOrderItemEnrichmentJobs.status,
          attemptCount: workOrderItemEnrichmentJobs.attemptCount,
          rolloutWasRetried: workOrderItemEnrichmentJobs.rolloutWasRetried,
          specificationStatus: workOrderItemProductionSpecifications.status,
          draftData: workOrderItemProductionSpecifications.draftData,
        })
        .from(workOrderItemEnrichmentJobs)
        .leftJoin(
          workOrderItemProductionSpecifications,
          eq(
            workOrderItemProductionSpecifications.workOrderItemId,
            workOrderItemEnrichmentJobs.workOrderItemId,
          ),
        )
        .where(eq(workOrderItemEnrichmentJobs.rolloutRunId, runId))

      const queued = jobs.filter((job) => job.status === 'queued').length
      const processing = jobs.filter((job) => job.status === 'processing').length
      const drafted = jobs.filter((job) => job.status === 'completed').length
      const needsReview = jobs.filter((job) => (
        job.status === 'completed' && job.specificationStatus === 'needs_review'
      )).length
      const unmapped = jobs.filter((job) => (
        job.status === 'completed' && containsUnmappedValue(job.draftData)
      )).length
      const failed = jobs.filter((job) => job.status === 'failed').length
      const retried = jobs.filter((job) => (
        job.attemptCount > 1 || job.rolloutWasRetried
      )).length
      const state = queued > 0 || processing > 0
        ? 'running' as const
        : failed > 0
          ? 'failed' as const
          : 'completed' as const
      const durationMs = Math.max(0, observedAt.getTime() - run.startedAt.getTime())
      const completedAt = state === 'running' ? null : (run.completedAt ?? observedAt)
      const safeFailureClass = failed > 0 ? 'enrichment_failed' : null

      const [saved] = await database
        .update(workOrderExistingItemRolloutRuns)
        .set({
          state,
          activeRunKey: state === 'running' ? true : null,
          queuedCount: queued,
          processingCount: processing,
          draftedCount: drafted,
          needsReviewCount: needsReview,
          unmappedCount: unmapped,
          failedCount: failed,
          retriedCount: retried,
          safeFailureClass,
          completedAt,
          durationMs,
          updatedAt: observedAt,
        })
        .where(eq(workOrderExistingItemRolloutRuns.id, runId))
        .returning()
      if (!saved) throw new Error('The rollout status could not be saved.')
      return rolloutStatus(saved)
    },

    async resumeFailedRun(runId, _actorId, resumedAt) {
      await database.transaction(async (tx) => {
        const [run] = await tx
          .update(workOrderExistingItemRolloutRuns)
          .set({
            state: 'running',
            activeRunKey: true,
            completedAt: null,
            safeFailureClass: null,
            updatedAt: resumedAt,
          })
          .where(and(
            eq(workOrderExistingItemRolloutRuns.id, runId),
            eq(workOrderExistingItemRolloutRuns.state, 'failed'),
          ))
          .returning({ id: workOrderExistingItemRolloutRuns.id })
        if (!run) throw new Error('Only a failed rollout can be resumed.')

        const retried = await tx
          .update(workOrderItemEnrichmentJobs)
          .set({
            status: 'queued',
            attemptCount: 0,
            rolloutWasRetried: true,
            availableAt: resumedAt,
            lockedAt: null,
            leaseExpiresAt: null,
            lastSafeError: null,
            updatedAt: resumedAt,
          })
          .where(and(
            eq(workOrderItemEnrichmentJobs.rolloutRunId, runId),
            eq(workOrderItemEnrichmentJobs.status, 'failed'),
          ))
          .returning({ id: workOrderItemEnrichmentJobs.id })

        if (retried.length === 0) throw new Error('The failed rollout has no failed work to resume.')
      })
    },

    async getLatestStatus(observedAt) {
      const [latest] = await database
        .select({ id: workOrderExistingItemRolloutRuns.id })
        .from(workOrderExistingItemRolloutRuns)
        .orderBy(desc(workOrderExistingItemRolloutRuns.startedAt))
        .limit(1)
      if (!latest) return null
      return createExistingItemRolloutStore(database).refreshStatus(latest.id, observedAt)
    },
  }
}

function containsUnmappedValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsUnmappedValue)
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record.state === 'unmapped') return true
  return Object.values(record).some(containsUnmappedValue)
}

function rolloutStatus(row: typeof workOrderExistingItemRolloutRuns.$inferSelect): ExistingItemRolloutStatus {
  if (row.state !== 'running' && row.state !== 'completed' && row.state !== 'failed') {
    throw new Error('The rollout has an unsupported persisted state.')
  }
  return {
    id: row.id,
    correlationId: row.correlationId,
    state: row.state,
    total: row.totalCount,
    queued: row.queuedCount,
    processing: row.processingCount,
    drafted: row.draftedCount,
    needsReview: row.needsReviewCount,
    unmapped: row.unmappedCount,
    failed: row.failedCount,
    retried: row.retriedCount,
    skippedRemoved: row.skippedRemovedCount,
    skippedConfirmed: row.skippedConfirmedCount,
    skippedCurrentKey: row.skippedCurrentKeyCount,
    safeFailureClass: row.safeFailureClass,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationMs: row.durationMs,
  }
}
