'use server'

import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  workOrderEvents,
  workOrderItemEnrichmentJobs,
  workOrderItemProductionSpecificationRevisions,
  workOrderItemProductionSpecifications,
  workOrderItems,
} from '@rgtools/db/schema-workorders'
import { assertCurrentUserCanManageWorkOrders } from './permissions'
import {
  PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
  confirmProductionSpecificationDraft,
  parsePersistedProductionSpecification,
  parseProductionSpecification,
} from './production-specifications'
import { fingerprintSourceDescription } from './item-label-lifecycle'
import { loadProductionSpecificationCatalogue } from './production-specification-catalogue'
import { WORK_ORDER_ENRICHMENT_PROMPT_VERSION } from './enrichment-jobs'

export async function saveWorkOrderItemProductionSpecificationDraftAction(
  itemId: string,
  input: unknown,
) {
  await assertCurrentUserCanManageWorkOrders()
  const session = await auth()
  const actorId = session?.user?.id ?? null
  const catalogue = await loadProductionSpecificationCatalogue()
  const draft = parseProductionSpecification(input, catalogue)
  const now = new Date()

  const saved = await db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: workOrderItems.id, isActive: workOrderItems.isActive })
      .from(workOrderItems)
      .where(and(eq(workOrderItems.id, itemId), eq(workOrderItems.isActive, true)))
      .limit(1)
    if (!item) throw new Error('The Work Order item is unavailable or has been removed.')

    const [specification] = await tx
      .insert(workOrderItemProductionSpecifications)
      .values({
        workOrderItemId: itemId,
        status: 'needs_review',
        schemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
        draftData: draft as unknown as Record<string, unknown>,
        draftUpdatedBy: actorId,
        draftUpdatedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: workOrderItemProductionSpecifications.workOrderItemId,
        set: {
          status: 'needs_review',
          schemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
          draftData: draft as unknown as Record<string, unknown>,
          draftUpdatedBy: actorId,
          draftUpdatedAt: now,
          updatedAt: now,
        },
      })
      .returning({
        id: workOrderItemProductionSpecifications.id,
        status: workOrderItemProductionSpecifications.status,
        draftData: workOrderItemProductionSpecifications.draftData,
      })
    if (!specification) throw new Error('Production specification draft could not be saved.')

    return {
      id: specification.id,
      status: specification.status,
      draftData: parseProductionSpecification(specification.draftData, catalogue),
    }
  })

  revalidatePath('/work-orders')
  return saved
}

export async function confirmWorkOrderItemProductionSpecificationAction(itemId: string) {
  await assertCurrentUserCanManageWorkOrders()
  const session = await auth()
  const actorId = session?.user?.id ?? null
  const confirmedAt = new Date()
  const catalogue = await loadProductionSpecificationCatalogue()

  const confirmed = await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: workOrderItems.id,
        workOrderId: workOrderItems.workOrderId,
        isActive: workOrderItems.isActive,
      })
      .from(workOrderItems)
      .where(and(eq(workOrderItems.id, itemId), eq(workOrderItems.isActive, true)))
      .limit(1)
    if (!item) throw new Error('The Work Order item is unavailable or has been removed.')

    const [current] = await tx
      .select({
        id: workOrderItemProductionSpecifications.id,
        draftData: workOrderItemProductionSpecifications.draftData,
        confirmedData: workOrderItemProductionSpecifications.confirmedData,
      })
      .from(workOrderItemProductionSpecifications)
      .where(eq(workOrderItemProductionSpecifications.workOrderItemId, itemId))
      .limit(1)
    if (!current?.draftData) throw new Error('This item has no Production Specification draft to confirm.')

    const transition = confirmProductionSpecificationDraft({
      specificationId: current.id,
      workOrderItemId: itemId,
      draft: parseProductionSpecification(current.draftData, catalogue),
      previousConfirmed: current.confirmedData
        ? parsePersistedProductionSpecification(current.confirmedData, catalogue)
        : null,
      actorId,
      confirmedAt,
      catalogue,
    })
    const specificationValues = {
      ...transition.specification,
      confirmedData: transition.specification.confirmedData as unknown as Record<string, unknown>,
    }
    const [saved] = await tx
      .update(workOrderItemProductionSpecifications)
      .set(specificationValues)
      .where(eq(workOrderItemProductionSpecifications.id, current.id))
      .returning({
        status: workOrderItemProductionSpecifications.status,
        productionLabel: workOrderItemProductionSpecifications.productionLabel,
      })
    if (!saved?.productionLabel) throw new Error('Production specification could not be confirmed.')

    await Promise.all([
      tx.insert(workOrderItemProductionSpecificationRevisions).values({
        ...transition.revision,
        previousSnapshot: transition.revision.previousSnapshot as unknown as Record<string, unknown> | null,
        newSnapshot: transition.revision.newSnapshot as unknown as Record<string, unknown>,
      }),
      tx.insert(workOrderEvents).values({
        workOrderId: item.workOrderId,
        workOrderItemId: itemId,
        actorId,
        fieldName: 'production_specification_confirmed',
        previousValue: transition.revision.previousSnapshot as unknown as Record<string, unknown> | null,
        newValue: transition.revision.newSnapshot as unknown as Record<string, unknown>,
        note: null,
        isClientVisibleCandidate: false,
      }),
    ])

    return saved
  })

  revalidatePath('/work-orders')
  return confirmed
}

export async function retryWorkOrderItemProductionSpecificationEnrichmentAction(itemId: string) {
  await assertCurrentUserCanManageWorkOrders()
  const session = await auth()
  const actorId = session?.user?.id ?? null

  const retried = await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: workOrderItems.id,
        workOrderId: workOrderItems.workOrderId,
        isActive: workOrderItems.isActive,
        originalDescription: workOrderItems.originalDescription,
      })
      .from(workOrderItems)
      .where(and(eq(workOrderItems.id, itemId), eq(workOrderItems.isActive, true)))
      .limit(1)
    if (!item) throw new Error('The Work Order item is unavailable or has been removed.')

    const [failedJob] = await tx
      .select({
        id: workOrderItemEnrichmentJobs.id,
        sourceDescription: workOrderItemEnrichmentJobs.sourceDescription,
        extractionSchemaVersion: workOrderItemEnrichmentJobs.extractionSchemaVersion,
        promptVersion: workOrderItemEnrichmentJobs.promptVersion,
      })
      .from(workOrderItemEnrichmentJobs)
      .where(and(
        eq(workOrderItemEnrichmentJobs.workOrderItemId, itemId),
        eq(
          workOrderItemEnrichmentJobs.sourceDescriptionFingerprint,
          fingerprintSourceDescription(item.originalDescription),
        ),
        eq(workOrderItemEnrichmentJobs.status, 'failed'),
      ))
      .orderBy(desc(workOrderItemEnrichmentJobs.createdAt))
      .limit(1)
    if (!failedJob) throw new Error('This item does not have a failed enrichment job to retry.')

    const now = new Date()
    const versionIsCurrent = failedJob.extractionSchemaVersion === PRODUCTION_SPECIFICATION_SCHEMA_VERSION
      && failedJob.promptVersion === WORK_ORDER_ENRICHMENT_PROMPT_VERSION
    const [job] = versionIsCurrent
      ? await tx
        .update(workOrderItemEnrichmentJobs)
        .set({
          status: 'queued',
          attemptCount: 0,
          availableAt: now,
          lockedAt: null,
          leaseExpiresAt: null,
          lastSafeError: null,
          updatedAt: now,
        })
        .where(and(
          eq(workOrderItemEnrichmentJobs.id, failedJob.id),
          eq(workOrderItemEnrichmentJobs.status, 'failed'),
        ))
        .returning({ id: workOrderItemEnrichmentJobs.id, status: workOrderItemEnrichmentJobs.status })
      : await tx
        .insert(workOrderItemEnrichmentJobs)
        .values({
          workOrderItemId: itemId,
          sourceDescription: failedJob.sourceDescription,
          sourceDescriptionFingerprint: fingerprintSourceDescription(item.originalDescription),
          extractionSchemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
          promptVersion: WORK_ORDER_ENRICHMENT_PROMPT_VERSION,
          status: 'queued',
          availableAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [
            workOrderItemEnrichmentJobs.workOrderItemId,
            workOrderItemEnrichmentJobs.sourceDescriptionFingerprint,
            workOrderItemEnrichmentJobs.extractionSchemaVersion,
            workOrderItemEnrichmentJobs.promptVersion,
          ],
        })
        .returning({ id: workOrderItemEnrichmentJobs.id, status: workOrderItemEnrichmentJobs.status })
    if (!job) throw new Error('Enrichment retry could not be queued.')

    await tx.insert(workOrderEvents).values({
      workOrderId: item.workOrderId,
      workOrderItemId: itemId,
      actorId,
      fieldName: 'production_specification_enrichment_retried',
      previousValue: {
        jobId: failedJob.id,
        extractionSchemaVersion: failedJob.extractionSchemaVersion,
        promptVersion: failedJob.promptVersion,
      },
      newValue: {
        jobId: job.id,
        extractionSchemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
        promptVersion: WORK_ORDER_ENRICHMENT_PROMPT_VERSION,
      },
      note: null,
      isClientVisibleCandidate: false,
    })
    return job
  })

  revalidatePath('/work-orders')
  return retried
}
