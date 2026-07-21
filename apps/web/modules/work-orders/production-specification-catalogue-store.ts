import { eq, isNotNull, sql } from 'drizzle-orm'

import { logAudit } from '@/lib/audit-db'
import { db } from '@/lib/db'
import { getPublishedPsConfiguration } from '@/modules/ps-generator/configuration'
import {
  workOrderEvents,
  workOrderItemProductionSpecificationRevisions,
  workOrderItemProductionSpecifications,
  workOrderItems,
  workOrders,
  workOrderSpecificationCatalogueOptions,
} from '@rgtools/db/schema-workorders'
import {
  buildProductionSpecificationCatalogueChange,
  loadProductionSpecificationCatalogue,
  parseProductionSpecificationCatalogueOptionInput,
  type ProductionSpecificationCatalogueAffectedSpecification,
  type ProductionSpecificationCatalogueOptionInput,
  validateProductionSpecificationCataloguePsMapping,
} from './production-specification-catalogue'
import type { ProductionSpecificationCatalogueOption } from './production-specifications'

export type ProductionSpecificationCatalogueImpactItem = {
  workOrderItemId: string
  jobNumber: string | null
  itemCode: string | null
  productionLabel: string | null
}

export type ProductionSpecificationCatalogueAdminOption = {
  option: ProductionSpecificationCatalogueOption
  affectedCount: number
  affectedItems: ProductionSpecificationCatalogueImpactItem[]
}

export async function getProductionSpecificationCatalogueAdminModel() {
  const [catalogue, affectedSpecifications] = await Promise.all([
    loadProductionSpecificationCatalogue(),
    loadAffectedSpecifications(db),
  ])

  return catalogue.map((option): ProductionSpecificationCatalogueAdminOption => {
    const affected = affectedSpecifications.filter(({ confirmedData }) => (
      containsCatalogueId(confirmedData, option.id)
    ))
    return {
      option,
      affectedCount: affected.length,
      affectedItems: affected.slice(0, 5).map((row) => ({
        workOrderItemId: row.workOrderItemId,
        jobNumber: row.jobNumber,
        itemCode: row.itemCode,
        productionLabel: row.productionLabel,
      })),
    }
  })
}

export async function saveProductionSpecificationCatalogueOption(input: {
  actorId: string
  editingId: string | null
  confirmedImpact: boolean
  option: ProductionSpecificationCatalogueOptionInput
}) {
  const psConfiguration = input.option.ps1Applicable === true || input.option.ps3Applicable === true
    ? await getPublishedPsConfiguration()
    : null
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('work_order_specification_catalogue'))`)

    const catalogue = await loadProductionSpecificationCatalogue(tx)
    const current = input.editingId
      ? catalogue.find((option) => option.id === input.editingId)
      : undefined
    if (input.editingId && !current) throw new Error('This catalogue option no longer exists. Reload before continuing.')

    const next = parseProductionSpecificationCatalogueOptionInput(input.option, catalogue, current)
    if ((next.ps1Applicable || next.ps3Applicable) && psConfiguration) {
      validateProductionSpecificationCataloguePsMapping(next, psConfiguration.optionCategories)
    }
    const affectedRows = current
      ? (await loadAffectedSpecifications(tx)).filter(({ confirmedData }) => (
        containsCatalogueId(confirmedData, current.id)
      ))
      : []
    const change = current
      ? buildProductionSpecificationCatalogueChange({
        current,
        next,
        catalogue,
        affectedSpecifications: affectedRows,
        confirmedImpact: input.confirmedImpact,
      })
      : { affectedCount: 0, rebuiltCount: 0, specificationUpdates: [] }
    const now = new Date()

    if (current) {
      const [saved] = await tx
        .update(workOrderSpecificationCatalogueOptions)
        .set({
          displayLabel: next.displayLabel,
          productionLabel: next.productionLabel,
          aliases: [...(next.aliases ?? [])],
          psCategorySlug: next.psCategorySlug ?? null,
          psOptionSlug: next.psOptionSlug ?? null,
          ps1Applicable: next.ps1Applicable ?? false,
          ps3Applicable: next.ps3Applicable ?? false,
          isActive: next.isActive ?? true,
          sortOrder: next.sortOrder ?? 0,
          updatedAt: now,
        })
        .where(eq(workOrderSpecificationCatalogueOptions.id, current.id))
        .returning({ id: workOrderSpecificationCatalogueOptions.id })
      if (!saved) throw new Error('This catalogue option changed in another session. Reload before continuing.')
    } else {
      const [saved] = await tx
        .insert(workOrderSpecificationCatalogueOptions)
        .values({
          id: next.id,
          fieldName: next.field,
          displayLabel: next.displayLabel,
          productionLabel: next.productionLabel,
          aliases: [...(next.aliases ?? [])],
          psCategorySlug: next.psCategorySlug ?? null,
          psOptionSlug: next.psOptionSlug ?? null,
          ps1Applicable: next.ps1Applicable ?? false,
          ps3Applicable: next.ps3Applicable ?? false,
          isActive: next.isActive ?? true,
          sortOrder: next.sortOrder ?? 0,
          createdBy: input.actorId,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: workOrderSpecificationCatalogueOptions.id })
        .returning({ id: workOrderSpecificationCatalogueOptions.id })
      if (!saved) throw new Error('That stable Catalogue ID is already in use.')
    }

    for (const update of change.specificationUpdates) {
      await tx
        .update(workOrderItemProductionSpecifications)
        .set({ productionLabel: update.productionLabel, updatedAt: now })
        .where(eq(workOrderItemProductionSpecifications.id, update.specificationId))
      await tx.insert(workOrderItemProductionSpecificationRevisions).values({
        specificationId: update.specificationId,
        workOrderItemId: update.workOrderItemId,
        actorId: input.actorId,
        revisionType: update.revision.revisionType,
        previousSnapshot: update.revision.previousSnapshot as unknown as Record<string, unknown>,
        newSnapshot: update.revision.newSnapshot as unknown as Record<string, unknown>,
        reasonCode: update.revision.reasonCode,
        note: update.revision.note,
        changes: update.revision.changes,
      })
      await tx.insert(workOrderEvents).values({
        workOrderId: update.workOrderId,
        workOrderItemId: update.workOrderItemId,
        actorId: input.actorId,
        fieldName: 'production_specification_catalogue_changed',
        previousValue: current ? { id: current.id, displayLabel: current.displayLabel } : null,
        newValue: { id: next.id, displayLabel: next.displayLabel },
        note: update.revision.note,
        isClientVisibleCandidate: false,
      })
    }

    await logAudit({
      actorId: input.actorId,
      entityType: 'work_order',
      action: current
        ? 'work_order.specification_catalogue.updated'
        : 'work_order.specification_catalogue.created',
      detail: {
        affectedConfirmedItems: change.affectedCount,
        stableId: next.id,
        field: next.field,
        before: current ? catalogueAuditSnapshot(current) : null,
        after: catalogueAuditSnapshot(next),
      },
    }, tx)

    return {
      affectedCount: change.affectedCount,
      rebuiltCount: change.rebuiltCount,
    }
  })
}

async function loadAffectedSpecifications(database: Pick<typeof db, 'select'>) {
  const rows = await database
    .select({
      specificationId: workOrderItemProductionSpecifications.id,
      workOrderItemId: workOrderItems.id,
      workOrderId: workOrders.id,
      confirmedData: workOrderItemProductionSpecifications.confirmedData,
      productionLabel: workOrderItemProductionSpecifications.productionLabel,
      jobNumber: workOrders.jobNumber,
      itemCode: workOrderItems.itemCode,
    })
    .from(workOrderItemProductionSpecifications)
    .innerJoin(workOrderItems, eq(workOrderItems.id, workOrderItemProductionSpecifications.workOrderItemId))
    .innerJoin(workOrders, eq(workOrders.id, workOrderItems.workOrderId))
    .where(isNotNull(workOrderItemProductionSpecifications.confirmedData))

  return rows.filter((row) => row.confirmedData !== null) as Array<
    ProductionSpecificationCatalogueAffectedSpecification & {
      jobNumber: string | null
      itemCode: string | null
    }
  >
}

function containsCatalogueId(value: unknown, catalogueId: string): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsCatalogueId(entry, catalogueId))
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record.catalogueId === catalogueId) return true
  return Object.values(record).some((entry) => containsCatalogueId(entry, catalogueId))
}

function catalogueAuditSnapshot(option: ProductionSpecificationCatalogueOption) {
  return {
    id: option.id,
    field: option.field,
    displayLabel: option.displayLabel,
    productionLabel: option.productionLabel,
    aliases: [...(option.aliases ?? [])],
    psCategorySlug: option.psCategorySlug ?? null,
    psOptionSlug: option.psOptionSlug ?? null,
    ps1Applicable: option.ps1Applicable ?? false,
    ps3Applicable: option.ps3Applicable ?? false,
    isActive: option.isActive ?? true,
    sortOrder: option.sortOrder ?? 0,
  }
}
