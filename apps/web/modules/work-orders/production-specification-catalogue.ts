import { asc } from 'drizzle-orm'

import { db } from '@/lib/db'
import { workOrderSpecificationCatalogueOptions } from '@rgtools/db/schema-workorders'
import {
  isProductionSpecificationFieldName,
  type ProductionSpecificationCatalogueOption,
} from './production-specifications'

export type ProductionSpecificationCatalogueLoader = () => Promise<ProductionSpecificationCatalogueOption[]>

export const loadProductionSpecificationCatalogue: ProductionSpecificationCatalogueLoader = async () => {
  const rows = await db
    .select({
      id: workOrderSpecificationCatalogueOptions.id,
      field: workOrderSpecificationCatalogueOptions.fieldName,
      displayLabel: workOrderSpecificationCatalogueOptions.displayLabel,
      productionLabel: workOrderSpecificationCatalogueOptions.productionLabel,
      aliases: workOrderSpecificationCatalogueOptions.aliases,
      psCategorySlug: workOrderSpecificationCatalogueOptions.psCategorySlug,
      psOptionSlug: workOrderSpecificationCatalogueOptions.psOptionSlug,
      isActive: workOrderSpecificationCatalogueOptions.isActive,
    })
    .from(workOrderSpecificationCatalogueOptions)
    .orderBy(
      asc(workOrderSpecificationCatalogueOptions.fieldName),
      asc(workOrderSpecificationCatalogueOptions.sortOrder),
      asc(workOrderSpecificationCatalogueOptions.id),
    )

  return rows.map((row) => {
    if (!isProductionSpecificationFieldName(row.field)) {
      throw new Error(`Unsupported Production Specification catalogue field ${row.field}.`)
    }
    return {
      id: row.id,
      field: row.field,
      displayLabel: row.displayLabel,
      productionLabel: row.productionLabel,
      aliases: row.aliases,
      psCategorySlug: row.psCategorySlug ?? undefined,
      psOptionSlug: row.psOptionSlug ?? undefined,
      isActive: row.isActive,
    }
  })
}

export const loadActiveProductionSpecificationCatalogue: ProductionSpecificationCatalogueLoader = async () => (
  (await loadProductionSpecificationCatalogue()).filter((option) => option.isActive !== false)
)
