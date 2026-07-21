import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  workOrderItemEnrichmentJobs,
  workOrderItemProductionSpecifications,
  workOrderItems,
  workOrders,
} from '@rgtools/db/schema-workorders'
import { fingerprintSourceDescription } from './item-label-lifecycle'
import { sanitizeWorkOrderEnrichmentSource } from './production-specification-enrichment'
import { PRODUCTION_SPECIFICATION_SCHEMA_VERSION } from './production-specifications'

export const WORK_ORDER_ENRICHMENT_PROMPT_VERSION = 'production-specification-v1'

export type WorkOrderItemEnrichmentCandidate = {
  servicem8ItemUuid: string
  originalDescription: string
}

export type WorkOrderItemEnrichmentEnqueuer = (
  candidates: WorkOrderItemEnrichmentCandidate[],
) => Promise<number | WorkOrderItemEnrichmentQueueResult>

export type WorkOrderItemEnrichmentQueueResult = {
  queued: number
  rejected: number
}

export const queueWorkOrderItemEnrichments: WorkOrderItemEnrichmentEnqueuer = async (candidates) => {
  if (candidates.length === 0) return { queued: 0, rejected: 0 }

  const candidateByUuid = new Map(candidates.map((candidate) => [candidate.servicem8ItemUuid, candidate]))
  const rows = await db
    .select({
      id: workOrderItems.id,
      servicem8ItemUuid: workOrderItems.servicem8ItemUuid,
      specificationId: workOrderItemProductionSpecifications.id,
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
      eq(workOrderItems.isActive, true),
      inArray(workOrderItems.servicem8ItemUuid, [...candidateByUuid.keys()]),
    ))

  let rejected = 0
  const values = rows.flatMap((row) => {
    const candidate = candidateByUuid.get(row.servicem8ItemUuid)
    if (!candidate || row.specificationId) return []
    let sourceDescription: string
    try {
      sourceDescription = sanitizeWorkOrderEnrichmentSource(candidate.originalDescription, {
        clientNames: [row.clientName, row.companyName],
        jobAddresses: [row.jobAddress],
      })
    } catch {
      rejected += 1
      return []
    }
    return [{
      workOrderItemId: row.id,
      sourceDescription,
      sourceDescriptionFingerprint: fingerprintSourceDescription(candidate.originalDescription),
      extractionSchemaVersion: PRODUCTION_SPECIFICATION_SCHEMA_VERSION,
      promptVersion: WORK_ORDER_ENRICHMENT_PROMPT_VERSION,
      status: 'queued' as const,
    }]
  })
  if (values.length === 0) return { queued: 0, rejected }

  const inserted = await db
    .insert(workOrderItemEnrichmentJobs)
    .values(values)
    .onConflictDoNothing({
      target: [
        workOrderItemEnrichmentJobs.workOrderItemId,
        workOrderItemEnrichmentJobs.sourceDescriptionFingerprint,
        workOrderItemEnrichmentJobs.extractionSchemaVersion,
        workOrderItemEnrichmentJobs.promptVersion,
      ],
    })
    .returning({ id: workOrderItemEnrichmentJobs.id })

  return { queued: inserted.length, rejected }
}
