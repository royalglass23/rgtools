import { asc } from 'drizzle-orm'

import { db } from '@/lib/db'
import { workOrderSpecificationCatalogueOptions } from '@rgtools/db/schema-workorders'
import {
  buildProductionLabel,
  isProductionSpecificationFieldName,
  parsePersistedProductionSpecification,
  type ProductionSpecification,
  type ProductionSpecificationCatalogueOption,
  type ProductionSpecificationFieldName,
} from './production-specifications'

export type ProductionSpecificationCatalogueLoader = () => Promise<ProductionSpecificationCatalogueOption[]>

type ProductionSpecificationCatalogueDatabase = Pick<typeof db, 'select'>

export async function loadProductionSpecificationCatalogue(
  database: ProductionSpecificationCatalogueDatabase = db,
) {
  const rows = await database
    .select({
      id: workOrderSpecificationCatalogueOptions.id,
      field: workOrderSpecificationCatalogueOptions.fieldName,
      displayLabel: workOrderSpecificationCatalogueOptions.displayLabel,
      productionLabel: workOrderSpecificationCatalogueOptions.productionLabel,
      aliases: workOrderSpecificationCatalogueOptions.aliases,
      psCategorySlug: workOrderSpecificationCatalogueOptions.psCategorySlug,
      psOptionSlug: workOrderSpecificationCatalogueOptions.psOptionSlug,
      ps1Applicable: workOrderSpecificationCatalogueOptions.ps1Applicable,
      ps3Applicable: workOrderSpecificationCatalogueOptions.ps3Applicable,
      isActive: workOrderSpecificationCatalogueOptions.isActive,
      sortOrder: workOrderSpecificationCatalogueOptions.sortOrder,
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
      ps1Applicable: row.ps1Applicable,
      ps3Applicable: row.ps3Applicable,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    }
  })
}

export const loadActiveProductionSpecificationCatalogue: ProductionSpecificationCatalogueLoader = async () => (
  (await loadProductionSpecificationCatalogue()).filter((option) => option.isActive !== false)
)

export type ProductionSpecificationCatalogueOptionInput = {
  id?: unknown
  field?: unknown
  displayLabel?: unknown
  productionLabel?: unknown
  aliases?: unknown
  psCategorySlug?: unknown
  psOptionSlug?: unknown
  ps1Applicable?: unknown
  ps3Applicable?: unknown
  isActive?: unknown
  sortOrder?: unknown
}

export function parseProductionSpecificationCatalogueOptionInput(
  input: ProductionSpecificationCatalogueOptionInput,
  catalogue: readonly ProductionSpecificationCatalogueOption[],
  current?: ProductionSpecificationCatalogueOption,
): ProductionSpecificationCatalogueOption {
  const id = current?.id ?? requiredText(input.id, 'Catalogue ID', 120)
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(id)) {
    throw new Error('Catalogue ID must be a stable lowercase identifier such as system.frameless-spigot.')
  }
  const field = current?.field ?? parseField(input.field)
  const displayLabel = requiredText(input.displayLabel, 'Display label', 120)
  const productionLabel = requiredText(input.productionLabel, 'Production Label wording', 120)
  const aliases = parseAliases(input.aliases)
  const ps1Applicable = input.ps1Applicable === true
  const ps3Applicable = input.ps3Applicable === true
  const psCategorySlug = optionalSlug(input.psCategorySlug, 'PS category')
  const psOptionSlug = optionalSlug(input.psOptionSlug, 'PS option')
  if ((ps1Applicable || ps3Applicable) && (!psCategorySlug || !psOptionSlug)) {
    throw new Error('PS-applicable options require both a PS category and PS option slug.')
  }
  if ((ps1Applicable || ps3Applicable) && field === 'glassConstruction' && psCategorySlug !== 'glass_type') {
    throw new Error('Glass Construction PS mappings must use the Glass type category.')
  }
  if ((ps1Applicable || ps3Applicable) && psCategorySlug === 'glass_type' && field !== 'glassConstruction') {
    throw new Error('The PS Glass type category belongs to Glass Construction, not Glass Appearance or another Work Order field.')
  }
  const isActive = input.isActive !== false
  const sortOrder = parseSortOrder(input.sortOrder)

  const candidateTokens = [id, displayLabel, productionLabel, ...aliases].map(normalizeAlias)

  for (const option of catalogue) {
    if (option.id === id || option.field !== field) continue
    const existingTokens = [option.id, option.displayLabel, option.productionLabel, ...(option.aliases ?? [])].map(normalizeAlias)
    const collision = candidateTokens.find((token) => existingTokens.includes(token))
    if (collision) throw new Error(`Alias ${collision} is already used by ${option.displayLabel}.`)
    if (
      psCategorySlug
      && psOptionSlug
      && option.psCategorySlug === psCategorySlug
      && option.psOptionSlug === psOptionSlug
    ) {
      throw new Error(`PS mapping ${psCategorySlug}.${psOptionSlug} is already used by ${option.displayLabel}.`)
    }
  }

  return {
    id,
    field,
    displayLabel,
    productionLabel,
    aliases,
    psCategorySlug,
    psOptionSlug,
    ps1Applicable,
    ps3Applicable,
    isActive,
    sortOrder,
  }
}

export function projectProductionSpecificationCatalogueOptionToPs(
  option: ProductionSpecificationCatalogueOption,
  documentType: 'ps1' | 'ps3',
) {
  const applicable = documentType === 'ps1' ? option.ps1Applicable : option.ps3Applicable
  if (!applicable || !option.psCategorySlug || !option.psOptionSlug) return null
  return {
    categorySlug: option.psCategorySlug,
    categoryLabel: option.psCategorySlug === 'glass_type'
      ? 'Glass type'
      : humanizeSlug(option.psCategorySlug),
    optionSlug: option.psOptionSlug,
  }
}

export function validateProductionSpecificationCataloguePsMapping(
  option: ProductionSpecificationCatalogueOption,
  optionCategories: ReadonlyArray<{
    slug: string
    label: string
    values: ReadonlyArray<{ slug: string; label: string }>
  }>,
) {
  for (const documentType of ['ps1', 'ps3'] as const) {
    const projection = projectProductionSpecificationCatalogueOptionToPs(option, documentType)
    if (!projection) continue
    const category = optionCategories.find(({ slug }) => slug === projection.categorySlug)
    const value = category?.values.find(({ slug }) => slug === projection.optionSlug)
    if (!category || !value) {
      throw new Error(`${documentType.toUpperCase()} mapping ${projection.categorySlug}.${projection.optionSlug} is not present in the published PS Generator configuration.`)
    }
  }
}

export type ProductionSpecificationCatalogueAffectedSpecification = {
  specificationId: string
  workOrderItemId: string
  workOrderId: string
  confirmedData: ProductionSpecification | Record<string, unknown>
  productionLabel: string | null
}

export function buildProductionSpecificationCatalogueChange(input: {
  current: ProductionSpecificationCatalogueOption
  next: ProductionSpecificationCatalogueOption
  catalogue: readonly ProductionSpecificationCatalogueOption[]
  affectedSpecifications: readonly ProductionSpecificationCatalogueAffectedSpecification[]
  confirmedImpact: boolean
}) {
  const governedChanges = catalogueHistoryChanges(input.current, input.next)
  const changesConfirmedMeaning = governedChanges.length > 0
  const affectedCount = input.affectedSpecifications.length
  if (changesConfirmedMeaning && affectedCount > 0 && !input.confirmedImpact) {
    throw new Error(`Confirm the impact on ${affectedCount} confirmed ${affectedCount === 1 ? 'item' : 'items'} before saving this catalogue change.`)
  }

  const nextCatalogue = input.catalogue.map((option) => (
    option.id === input.current.id ? input.next : option
  ))
  const note = `Catalogue option ${input.current.id} changed: ${governedChanges
    .map((change) => `${change.label} ${change.previousValue} -> ${change.newValue}`)
    .join('; ')}.`
  const specificationUpdates = changesConfirmedMeaning
    ? input.affectedSpecifications.map((affected) => {
      const confirmedData = parsePersistedProductionSpecification(affected.confirmedData, nextCatalogue)
      return {
        ...affected,
        productionLabel: buildProductionLabel(confirmedData, nextCatalogue),
        revision: {
          revisionType: 'catalogue_option_changed' as const,
          previousSnapshot: confirmedData,
          newSnapshot: confirmedData,
          reasonCode: null,
          note,
          changes: governedChanges.map((change) => ({
            kind: 'catalogue',
            identity: input.current.id,
            ...change,
          })),
        },
      }
    })
    : []

  return {
    affectedCount,
    rebuiltCount: specificationUpdates.length,
    specificationUpdates,
  }
}

function catalogueHistoryChanges(
  current: ProductionSpecificationCatalogueOption,
  next: ProductionSpecificationCatalogueOption,
) {
  return [
    current.displayLabel === next.displayLabel ? null : {
      label: 'Display label',
      previousValue: current.displayLabel,
      newValue: next.displayLabel,
    },
    current.productionLabel === next.productionLabel ? null : {
      label: 'Production Label wording',
      previousValue: current.productionLabel,
      newValue: next.productionLabel,
    },
    current.isActive === next.isActive ? null : {
      label: 'State',
      previousValue: current.isActive === false ? 'Deprecated' : 'Active',
      newValue: next.isActive === false ? 'Deprecated' : 'Active',
    },
  ].filter((change): change is { label: string; previousValue: string; newValue: string } => change !== null)
}

function parseField(input: unknown): ProductionSpecificationFieldName {
  if (typeof input !== 'string' || !isProductionSpecificationFieldName(input)) {
    throw new Error('Choose a supported Production Specification field.')
  }
  return input
}

function parseAliases(input: unknown) {
  if (!Array.isArray(input)) throw new Error('Aliases must be a list.')
  if (input.length > 100) throw new Error('Catalogue options can have at most 100 aliases.')
  return input
    .map((alias) => requiredText(alias, 'Alias', 120))
    .filter(Boolean)
}

function parseSortOrder(input: unknown) {
  const value = typeof input === 'number' ? input : Number(input)
  if (!Number.isInteger(value) || value < 0 || value > 100_000) {
    throw new Error('Sort order must be a whole number from 0 to 100000.')
  }
  return value
}

function requiredText(input: unknown, label: string, maxLength: number) {
  if (typeof input !== 'string' || !input.trim()) throw new Error(`${label} is required.`)
  const value = input.trim()
  if (value.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`)
  return value
}

function optionalSlug(input: unknown, label: string) {
  if (input === undefined || input === null || input === '') return undefined
  const value = requiredText(input, label, 120).toLowerCase()
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)) {
    throw new Error(`${label} must use lowercase letters, numbers, dots, underscores, or hyphens.`)
  }
  return value
}

function normalizeAlias(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, ' ')
}

function humanizeSlug(input: string) {
  return input.replace(/[._-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}
