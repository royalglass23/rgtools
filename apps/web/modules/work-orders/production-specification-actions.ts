'use server'

import { and, desc, eq, sql } from 'drizzle-orm'
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
  type ProductionSpecificationChangeReasonCode,
} from './production-specifications'
import { fingerprintSourceDescription } from './item-label-lifecycle'
import { loadProductionSpecificationCatalogue } from './production-specification-catalogue'
import { WORK_ORDER_ENRICHMENT_PROMPT_VERSION } from './enrichment-jobs'

type WorkOrderTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function saveWorkOrderItemProductionSpecificationDraftAction(
  itemId: string,
  input: unknown,
  revision: {
    expectedConfirmedRevision: number
    expectedDraftRevision: number
  },
) {
  await assertCurrentUserCanManageWorkOrders()
  const session = await auth()
  const actorId = session?.user?.id ?? null
  const catalogue = await loadProductionSpecificationCatalogue()
  const draft = parseProductionSpecification(input, catalogue)
  const now = new Date()

  const saved = await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: workOrderItems.id,
        isActive: workOrderItems.isActive,
        originalDescription: workOrderItems.originalDescription,
      })
      .from(workOrderItems)
      .where(and(eq(workOrderItems.id, itemId), eq(workOrderItems.isActive, true)))
      .limit(1)
    if (!item) throw new Error('The Work Order item is unavailable or has been removed.')

    const [current] = await tx
      .select({
        id: workOrderItemProductionSpecifications.id,
        confirmedData: workOrderItemProductionSpecifications.confirmedData,
        confirmedRevision: workOrderItemProductionSpecifications.confirmedRevision,
        draftRevision: workOrderItemProductionSpecifications.draftRevision,
      })
      .from(workOrderItemProductionSpecifications)
      .where(eq(workOrderItemProductionSpecifications.workOrderItemId, itemId))
      .limit(1)
    const sourceFingerprint = fingerprintSourceDescription(item.originalDescription)
    const returning = {
      id: workOrderItemProductionSpecifications.id,
      status: workOrderItemProductionSpecifications.status,
      draftData: workOrderItemProductionSpecifications.draftData,
      confirmedRevision: workOrderItemProductionSpecifications.confirmedRevision,
      draftRevision: workOrderItemProductionSpecifications.draftRevision,
    }

    let specification
    if (current) {
      if (
        current.confirmedRevision !== revision.expectedConfirmedRevision
        || current.draftRevision !== revision.expectedDraftRevision
      ) {
        throw new Error('This Production Specification changed in another session. Reload before continuing.')
      }
      ;[specification] = await tx
        .update(workOrderItemProductionSpecifications)
        .set({
          status: current.confirmedData ? 'confirmed' : 'needs_review',
          schemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
          draftData: draft as unknown as Record<string, unknown>,
          draftUpdatedBy: actorId,
          draftUpdatedAt: now,
          draftSourceDescription: item.originalDescription,
          draftSourceDescriptionFingerprint: sourceFingerprint,
          draftRevision: sql`${workOrderItemProductionSpecifications.draftRevision} + 1`,
          draftBaseRevision: current.confirmedRevision,
          updatedAt: now,
        })
        .where(and(
          eq(workOrderItemProductionSpecifications.id, current.id),
          eq(workOrderItemProductionSpecifications.confirmedRevision, revision.expectedConfirmedRevision),
          eq(workOrderItemProductionSpecifications.draftRevision, revision.expectedDraftRevision),
        ))
        .returning(returning)
    } else {
      if (revision.expectedConfirmedRevision !== 0 || revision.expectedDraftRevision !== 0) {
        throw new Error('This Production Specification changed in another session. Reload before continuing.')
      }
      ;[specification] = await tx
        .insert(workOrderItemProductionSpecifications)
        .values({
          workOrderItemId: itemId,
          status: 'needs_review',
          schemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
          draftData: draft as unknown as Record<string, unknown>,
          draftUpdatedBy: actorId,
          draftUpdatedAt: now,
          draftSourceDescription: item.originalDescription,
          draftSourceDescriptionFingerprint: sourceFingerprint,
          draftRevision: 1,
          draftBaseRevision: 0,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: workOrderItemProductionSpecifications.workOrderItemId })
        .returning(returning)
    }
    if (!specification) {
      throw new Error('This Production Specification changed in another session. Reload before continuing.')
    }

    return {
      id: specification.id,
      status: specification.status,
      draftData: parseProductionSpecification(specification.draftData, catalogue),
      confirmedRevision: specification.confirmedRevision,
      draftRevision: specification.draftRevision,
    }
  })

  revalidatePath('/work-orders')
  return saved
}

export async function confirmWorkOrderItemProductionSpecificationAction(
  itemId: string,
  input: {
    expectedConfirmedRevision: number
    expectedDraftRevision: number
    changeReason?: {
      code: ProductionSpecificationChangeReasonCode
      note?: string
    }
  },
) {
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
        sourceDescription: workOrderItemProductionSpecifications.sourceDescription,
        sourceDescriptionFingerprint: workOrderItemProductionSpecifications.sourceDescriptionFingerprint,
        draftSourceDescription: workOrderItemProductionSpecifications.draftSourceDescription,
        draftSourceDescriptionFingerprint: workOrderItemProductionSpecifications.draftSourceDescriptionFingerprint,
        confirmedRevision: workOrderItemProductionSpecifications.confirmedRevision,
        draftRevision: workOrderItemProductionSpecifications.draftRevision,
        draftBaseRevision: workOrderItemProductionSpecifications.draftBaseRevision,
      })
      .from(workOrderItemProductionSpecifications)
      .where(eq(workOrderItemProductionSpecifications.workOrderItemId, itemId))
      .limit(1)
    if (!current?.draftData) throw new Error('This item has no Production Specification draft to confirm.')
    if (
      current.confirmedRevision !== input.expectedConfirmedRevision
      || current.draftRevision !== input.expectedDraftRevision
      || current.draftBaseRevision !== current.confirmedRevision
    ) {
      throw new Error('This Production Specification changed in another session. Reload before continuing.')
    }

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
      changeReason: input.changeReason,
    })
    const specificationValues = {
      ...transition.specification,
      confirmedData: transition.specification.confirmedData as unknown as Record<string, unknown>,
      sourceDescription: current.draftSourceDescription ?? current.sourceDescription,
      sourceDescriptionFingerprint:
        current.draftSourceDescriptionFingerprint ?? current.sourceDescriptionFingerprint,
      draftSourceDescription: null,
      draftSourceDescriptionFingerprint: null,
      ignoredSourceDescriptionFingerprint: null,
      confirmedRevision: sql`${workOrderItemProductionSpecifications.confirmedRevision} + 1`,
      draftBaseRevision: null,
    }
    const [saved] = await tx
      .update(workOrderItemProductionSpecifications)
      .set(specificationValues)
      .where(and(
        eq(workOrderItemProductionSpecifications.id, current.id),
        eq(workOrderItemProductionSpecifications.confirmedRevision, input.expectedConfirmedRevision),
        eq(workOrderItemProductionSpecifications.draftRevision, input.expectedDraftRevision),
        eq(workOrderItemProductionSpecifications.draftBaseRevision, input.expectedConfirmedRevision),
      ))
      .returning({
        status: workOrderItemProductionSpecifications.status,
        productionLabel: workOrderItemProductionSpecifications.productionLabel,
        confirmedRevision: workOrderItemProductionSpecifications.confirmedRevision,
      })
    if (!saved?.productionLabel) {
      throw new Error('This Production Specification changed in another session. Reload before continuing.')
    }

    await Promise.all([
      tx.insert(workOrderItemProductionSpecificationRevisions).values({
        ...transition.revision,
        previousSnapshot: transition.revision.previousSnapshot as unknown as Record<string, unknown> | null,
        newSnapshot: transition.revision.newSnapshot as unknown as Record<string, unknown>,
        changes: transition.revision.changes as unknown as Array<Record<string, unknown>>,
      }),
      tx.insert(workOrderEvents).values({
        workOrderId: item.workOrderId,
        workOrderItemId: itemId,
        actorId,
        fieldName: 'production_specification_confirmed',
        previousValue: transition.revision.previousSnapshot as unknown as Record<string, unknown> | null,
        newValue: transition.revision.newSnapshot as unknown as Record<string, unknown>,
        note: transition.revision.reasonCode
          ? `Confirmed revision: ${transition.revision.reasonCode}`
          : null,
        isClientVisibleCandidate: false,
      }),
    ])

    return saved
  })

  revalidatePath('/work-orders')
  return confirmed
}

export async function ignoreWorkOrderItemProductionSpecificationSourceChangeAction(
  itemId: string,
  input: {
    expectedConfirmedRevision: number
    sourceDescriptionFingerprint: string
  },
) {
  await assertCurrentUserCanManageWorkOrders()
  const session = await auth()
  const actorId = session?.user?.id ?? null
  const result = await db.transaction(async (tx) => {
    const { item, current, sourceDescriptionFingerprint } = await loadCurrentSourceChangeContext(tx, itemId, {
      expectedConfirmedRevision: input.expectedConfirmedRevision,
      expectedSourceDescriptionFingerprint: input.sourceDescriptionFingerprint,
    })

    const [saved] = await tx
      .update(workOrderItemProductionSpecifications)
      .set({
        ignoredSourceDescriptionFingerprint: sourceDescriptionFingerprint,
        updatedAt: new Date(),
      })
      .where(and(
        eq(workOrderItemProductionSpecifications.id, current.id),
        eq(workOrderItemProductionSpecifications.confirmedRevision, input.expectedConfirmedRevision),
      ))
      .returning({ id: workOrderItemProductionSpecifications.id })
    if (!saved) throw new Error('This Production Specification changed in another session. Reload before continuing.')

    await recordSourceChangeDecision(tx, {
      itemId,
      actorId,
      item,
      current,
      sourceDescriptionFingerprint,
      revisionType: 'source_change_ignored',
      eventFieldName: 'production_specification_source_change_ignored',
      note: 'ServiceM8 source change ignored.',
    })
    return { status: 'ignored' as const, sourceDescriptionFingerprint }
  })

  revalidatePath('/work-orders')
  return result
}

export async function createWorkOrderItemProductionSpecificationDraftFromSourceChangeAction(
  itemId: string,
  input: {
    expectedConfirmedRevision: number
    expectedDraftRevision: number
    sourceDescriptionFingerprint: string
  },
) {
  await assertCurrentUserCanManageWorkOrders()
  const session = await auth()
  const actorId = session?.user?.id ?? null
  const result = await db.transaction(async (tx) => {
    const { item, current, sourceDescriptionFingerprint } = await loadCurrentSourceChangeContext(tx, itemId, {
      expectedConfirmedRevision: input.expectedConfirmedRevision,
      expectedSourceDescriptionFingerprint: input.sourceDescriptionFingerprint,
    })
    if (current.draftRevision !== input.expectedDraftRevision) {
      throw new Error('This Production Specification changed in another session. Reload before continuing.')
    }
    if (current.draftData) {
      throw new Error('A Production Specification draft already exists. Review it before creating another draft.')
    }

    const [saved] = await tx
      .update(workOrderItemProductionSpecifications)
      .set({
        status: 'confirmed',
        draftData: current.confirmedData,
        draftUpdatedBy: actorId,
        draftUpdatedAt: new Date(),
        draftSourceDescription: item.originalDescription,
        draftSourceDescriptionFingerprint: sourceDescriptionFingerprint,
        ignoredSourceDescriptionFingerprint: null,
        draftRevision: sql`${workOrderItemProductionSpecifications.draftRevision} + 1`,
        draftBaseRevision: current.confirmedRevision,
        updatedAt: new Date(),
      })
      .where(and(
        eq(workOrderItemProductionSpecifications.id, current.id),
        eq(workOrderItemProductionSpecifications.confirmedRevision, input.expectedConfirmedRevision),
        eq(workOrderItemProductionSpecifications.draftRevision, input.expectedDraftRevision),
      ))
      .returning({
        id: workOrderItemProductionSpecifications.id,
        status: workOrderItemProductionSpecifications.status,
        draftData: workOrderItemProductionSpecifications.draftData,
        confirmedRevision: workOrderItemProductionSpecifications.confirmedRevision,
        draftRevision: workOrderItemProductionSpecifications.draftRevision,
      })
    if (!saved) throw new Error('This Production Specification changed in another session. Reload before continuing.')

    await recordSourceChangeDecision(tx, {
      itemId,
      actorId,
      item,
      current,
      sourceDescriptionFingerprint,
      revisionType: 'source_change_draft_created',
      eventFieldName: 'production_specification_source_change_draft_created',
      note: 'Reviewable draft created from changed ServiceM8 source.',
    })
    return saved
  })

  revalidatePath('/work-orders')
  return result
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

async function loadCurrentSourceChangeContext(
  tx: WorkOrderTransaction,
  itemId: string,
  expected: {
    expectedConfirmedRevision: number
    expectedSourceDescriptionFingerprint: string
  },
) {
  const [item] = await tx
    .select({
      id: workOrderItems.id,
      workOrderId: workOrderItems.workOrderId,
      originalDescription: workOrderItems.originalDescription,
    })
    .from(workOrderItems)
    .where(and(eq(workOrderItems.id, itemId), eq(workOrderItems.isActive, true)))
    .limit(1)
  if (!item) throw new Error('The Work Order item is unavailable or has been removed.')

  const [current] = await tx
    .select({
      id: workOrderItemProductionSpecifications.id,
      confirmedData: workOrderItemProductionSpecifications.confirmedData,
      draftData: workOrderItemProductionSpecifications.draftData,
      sourceDescription: workOrderItemProductionSpecifications.sourceDescription,
      sourceDescriptionFingerprint: workOrderItemProductionSpecifications.sourceDescriptionFingerprint,
      confirmedRevision: workOrderItemProductionSpecifications.confirmedRevision,
      draftRevision: workOrderItemProductionSpecifications.draftRevision,
    })
    .from(workOrderItemProductionSpecifications)
    .where(eq(workOrderItemProductionSpecifications.workOrderItemId, itemId))
    .limit(1)
  if (!current?.confirmedData) throw new Error('This item has no confirmed Production Specification.')

  const sourceDescriptionFingerprint = fingerprintSourceDescription(item.originalDescription)
  assertCurrentSourceChange({
    ...expected,
    sourceDescriptionFingerprint,
    confirmedRevision: current.confirmedRevision,
    confirmedSourceDescriptionFingerprint: current.sourceDescriptionFingerprint,
    confirmedSourceDescription: current.sourceDescription,
    currentSourceDescription: item.originalDescription,
  })

  return {
    item,
    current: { ...current, confirmedData: current.confirmedData },
    sourceDescriptionFingerprint,
  }
}

async function recordSourceChangeDecision(
  tx: WorkOrderTransaction,
  input: {
    itemId: string
    actorId: string | null
    item: {
      workOrderId: string
      originalDescription: string
    }
    current: {
      id: string
      confirmedData: Record<string, unknown>
      sourceDescription: string | null
      sourceDescriptionFingerprint: string | null
    }
    sourceDescriptionFingerprint: string
    revisionType: 'source_change_ignored' | 'source_change_draft_created'
    eventFieldName:
      | 'production_specification_source_change_ignored'
      | 'production_specification_source_change_draft_created'
    note: string
  },
) {
  const previousSource = {
    sourceDescription: input.current.sourceDescription,
    sourceDescriptionFingerprint: input.current.sourceDescriptionFingerprint,
  }
  const currentSource = {
    sourceDescription: input.item.originalDescription,
    sourceDescriptionFingerprint: input.sourceDescriptionFingerprint,
  }
  await Promise.all([
    tx.insert(workOrderItemProductionSpecificationRevisions).values({
      specificationId: input.current.id,
      workOrderItemId: input.itemId,
      actorId: input.actorId,
      revisionType: input.revisionType,
      previousSnapshot: input.current.confirmedData,
      newSnapshot: input.current.confirmedData,
      reasonCode: null,
      note: input.note,
      changes: [],
    }),
    tx.insert(workOrderEvents).values({
      workOrderId: input.item.workOrderId,
      workOrderItemId: input.itemId,
      actorId: input.actorId,
      fieldName: input.eventFieldName,
      previousValue: previousSource,
      newValue: currentSource,
      note: input.note,
      isClientVisibleCandidate: false,
    }),
  ])
}

function assertCurrentSourceChange(input: {
  expectedConfirmedRevision: number
  expectedSourceDescriptionFingerprint: string
  sourceDescriptionFingerprint: string
  confirmedRevision: number
  confirmedSourceDescriptionFingerprint: string | null
  confirmedSourceDescription: string | null
  currentSourceDescription: string
}) {
  if (
    input.confirmedRevision !== input.expectedConfirmedRevision
    || input.sourceDescriptionFingerprint !== input.expectedSourceDescriptionFingerprint
  ) {
    throw new Error('This Production Specification changed in another session. Reload before continuing.')
  }
  const sourceChanged = input.confirmedSourceDescriptionFingerprint
    ? input.confirmedSourceDescriptionFingerprint !== input.sourceDescriptionFingerprint
    : input.confirmedSourceDescription !== input.currentSourceDescription
  if (!sourceChanged) throw new Error('The ServiceM8 source no longer differs from the confirmed specification.')
}
