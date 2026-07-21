import { and, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  workOrderItemEnrichmentJobs,
  workOrderItemProductionSpecifications,
  workOrderItems,
} from '@rgtools/db/schema-workorders'
import {
  buildProductionLabel,
  INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
} from './production-specifications'
import type {
  ClaimedWorkOrderEnrichmentJob,
  WorkOrderEnrichmentRuntimeStore,
} from './enrichment-worker'

export function createWorkOrderEnrichmentRuntimeStore(
  options: { jobNumber?: string } = {},
): WorkOrderEnrichmentRuntimeStore {
  const scopedJobNumber = options.jobNumber ?? null

  return {
    async claim(limit, leaseMs) {
      const claimed = await db.execute(sql`
        WITH candidates AS (
          SELECT jobs.id
          FROM work_order_item_enrichment_jobs AS jobs
          INNER JOIN work_order_items
            ON work_order_items.id = jobs.work_order_item_id
          INNER JOIN work_orders
            ON work_orders.id = work_order_items.work_order_id
          WHERE (
            (jobs.status = 'queued' AND jobs.available_at <= now())
            OR (jobs.status = 'processing' AND jobs.lease_expires_at <= now())
          )
            AND (${scopedJobNumber}::text IS NULL OR work_orders.job_number = ${scopedJobNumber})
          ORDER BY jobs.available_at ASC, jobs.created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE work_order_item_enrichment_jobs AS jobs
        SET status = 'processing',
            attempt_count = jobs.attempt_count + 1,
            locked_at = now(),
            lease_expires_at = now() + (${leaseMs} * INTERVAL '1 millisecond'),
            last_safe_error = NULL,
            updated_at = now()
        FROM candidates
        WHERE jobs.id = candidates.id
        RETURNING
          jobs.id,
          jobs.work_order_item_id,
           jobs.source_description,
          jobs.attempt_count,
          jobs.extraction_schema_version,
          jobs.prompt_version
      `)

      return claimed.rows.map((row) => ({
        id: String(row.id),
        workOrderItemId: String(row.work_order_item_id),
        sourceDescription: String(row.source_description),
        attemptCount: Number(row.attempt_count),
        extractionSchemaVersion: Number(row.extraction_schema_version),
        promptVersion: String(row.prompt_version),
      } satisfies ClaimedWorkOrderEnrichmentJob))
    },

    async saveDraft(job, output, modelIdentifier, catalogue = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE) {
      return db.transaction(async (tx) => {
        const [item] = await tx
          .select({ id: workOrderItems.id, isActive: workOrderItems.isActive })
          .from(workOrderItems)
          .where(eq(workOrderItems.id, job.workOrderItemId))
          .limit(1)
        const [current] = await tx
          .select({
            id: workOrderItemProductionSpecifications.id,
            status: workOrderItemProductionSpecifications.status,
            draftUpdatedBy: workOrderItemProductionSpecifications.draftUpdatedBy,
          })
          .from(workOrderItemProductionSpecifications)
          .where(eq(workOrderItemProductionSpecifications.workOrderItemId, job.workOrderItemId))
          .limit(1)

        const skippedOutcome = !item?.isActive
          ? 'skipped_inactive' as const
          : current?.status === 'confirmed'
            ? 'skipped_confirmed' as const
            : current?.draftUpdatedBy
              ? 'skipped_staff_edited' as const
              : null
        if (skippedOutcome) {
          await tx
            .update(workOrderItemEnrichmentJobs)
            .set({
              status: 'completed',
              lockedAt: null,
              leaseExpiresAt: null,
              lastSafeError: null,
              updatedAt: new Date(),
            })
            .where(eq(workOrderItemEnrichmentJobs.id, job.id))
          return skippedOutcome
        }

        const generatedAt = new Date()
        const specificationValues = {
          status: 'needs_review' as const,
          schemaVersion: output.schemaVersion,
          draftData: output.specification as unknown as Record<string, unknown>,
          evidenceData: output.evidence as unknown as Array<Record<string, unknown>>,
          ambiguityFlags: output.ambiguityFlags,
          sourceDescriptionFingerprint: sql<string>`(
            SELECT source_description_fingerprint
            FROM work_order_item_enrichment_jobs
            WHERE id = ${job.id}
          )`,
          draftSourceDescription: job.sourceDescription,
          draftSourceDescriptionFingerprint: sql<string>`(
            SELECT source_description_fingerprint
            FROM work_order_item_enrichment_jobs
            WHERE id = ${job.id}
          )`,
          extractionSchemaVersion: output.schemaVersion,
          promptVersion: sql<string>`(
            SELECT prompt_version
            FROM work_order_item_enrichment_jobs
            WHERE id = ${job.id}
          )`,
          modelIdentifier,
          generatedAt,
          productionLabel: null,
          draftUpdatedBy: null,
          draftUpdatedAt: generatedAt,
          updatedAt: generatedAt,
        }

        if (current) {
          const updated = await tx
            .update(workOrderItemProductionSpecifications)
            .set({
              ...specificationValues,
              draftRevision: sql`${workOrderItemProductionSpecifications.draftRevision} + 1`,
              draftBaseRevision: 0,
            })
            .where(and(
              eq(workOrderItemProductionSpecifications.id, current.id),
              eq(workOrderItemProductionSpecifications.status, 'needs_review'),
              isNull(workOrderItemProductionSpecifications.draftUpdatedBy),
            ))
            .returning({ id: workOrderItemProductionSpecifications.id })
          if (updated.length === 0) {
            const [latest] = await tx
              .select({
                status: workOrderItemProductionSpecifications.status,
                draftUpdatedBy: workOrderItemProductionSpecifications.draftUpdatedBy,
              })
              .from(workOrderItemProductionSpecifications)
              .where(eq(workOrderItemProductionSpecifications.id, current.id))
              .limit(1)
            await tx
              .update(workOrderItemEnrichmentJobs)
              .set({
                status: 'completed',
                lockedAt: null,
                leaseExpiresAt: null,
                lastSafeError: null,
                updatedAt: generatedAt,
              })
              .where(eq(workOrderItemEnrichmentJobs.id, job.id))
            return latest?.status === 'needs_review' && latest.draftUpdatedBy
              ? 'skipped_staff_edited'
              : 'skipped_confirmed'
          }
        } else {
          await tx.insert(workOrderItemProductionSpecifications).values({
            workOrderItemId: job.workOrderItemId,
            ...specificationValues,
            draftRevision: 1,
            draftBaseRevision: 0,
          })
        }

        const rolloutLabel = buildProductionLabel(output.specification, catalogue)
        if (rolloutLabel && rolloutLabel !== 'Location TBC') {
          await tx
            .update(workOrderItems)
            .set({
              generatedLabel: rolloutLabel,
              labelStatus: 'generated',
              sourceDescriptionFingerprint: sql<string>`(
                SELECT source_description_fingerprint
                FROM work_order_item_enrichment_jobs
                WHERE id = ${job.id}
              )`,
              updatedAt: generatedAt,
            })
            .where(and(
              eq(workOrderItems.id, job.workOrderItemId),
              isNull(workOrderItems.manualLabelOverride),
            ))
        }

        await tx
          .update(workOrderItemEnrichmentJobs)
          .set({
            status: 'completed',
            modelIdentifier,
            generatedAt,
            lockedAt: null,
            leaseExpiresAt: null,
            lastSafeError: null,
            updatedAt: generatedAt,
          })
          .where(eq(workOrderItemEnrichmentJobs.id, job.id))
        return 'saved'
      })
    },

    async markRetry(jobId, availableAt, safeError) {
      await db
        .update(workOrderItemEnrichmentJobs)
        .set({
          status: 'queued',
          availableAt,
          lockedAt: null,
          leaseExpiresAt: null,
          lastSafeError: safeError,
          updatedAt: new Date(),
        })
        .where(eq(workOrderItemEnrichmentJobs.id, jobId))
    },

    async markFailed(jobId, safeError) {
      await db
        .update(workOrderItemEnrichmentJobs)
        .set({
          status: 'failed',
          lockedAt: null,
          leaseExpiresAt: null,
          lastSafeError: safeError,
          updatedAt: new Date(),
        })
        .where(eq(workOrderItemEnrichmentJobs.id, jobId))
    },
  }
}
