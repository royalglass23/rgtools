'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  workOrderEvents,
  workOrderItemProductionSpecificationRevisions,
  workOrderItemProductionSpecifications,
  workOrderItems,
} from '@rgtools/db/schema-workorders'
import { assertCurrentUserCanManageWorkOrders } from './permissions'
import {
  PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
  confirmProductionSpecificationDraft,
  parseProductionSpecification,
} from './production-specifications'

export async function saveWorkOrderItemProductionSpecificationDraftAction(
  itemId: string,
  input: unknown,
) {
  await assertCurrentUserCanManageWorkOrders()
  const session = await auth()
  const actorId = session?.user?.id ?? null
  const draft = parseProductionSpecification(input)
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
      draftData: parseProductionSpecification(specification.draftData),
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
      draft: parseProductionSpecification(current.draftData),
      previousConfirmed: current.confirmedData
        ? parseProductionSpecification(current.confirmedData)
        : null,
      actorId,
      confirmedAt,
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
