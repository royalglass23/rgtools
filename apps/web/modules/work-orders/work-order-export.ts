import type { WorkOrderExportRow } from './queries'
import type { WorkOrderSummaryFieldConfig } from './summary-config'
import type { WorkOrderItemSummaryRow } from './work-order-items'
import {
  INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
  PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS,
  parsePersistedProductionSpecification,
  productionSpecificationValueLabel,
  type ProductionSpecification,
  type ProductionSpecificationCatalogueOption,
} from './production-specifications'

export type { WorkOrderExportRow } from './queries'

const REQUIRED_EXPORT_FIELDS = new Set<WorkOrderSummaryFieldConfig['id']>([
  'jobNumber',
  'client',
  'jobAddress',
  'leadScore',
  'item',
])

const SPECIFICATION_EXPORT_HEADINGS = [
  'Specification Review Status',
  'Production Label',
  ...PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS.map(({ label }) => `Confirmed ${label}`),
  'Confirmed Measurements',
  'Confirmed Additional Components',
  'Confirmed Special Requirements',
]

export function buildWorkOrderExportTable(
  rows: WorkOrderExportRow[],
  fields: WorkOrderSummaryFieldConfig[],
  catalogue: readonly ProductionSpecificationCatalogueOption[] = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
) {
  const exportFields = fields
    .filter((field) => field.visible || REQUIRED_EXPORT_FIELDS.has(field.id))
    .sort((left, right) => left.order - right.order)

  return [
    [...exportFields.map((field) => field.label), ...SPECIFICATION_EXPORT_HEADINGS],
    ...rows.map((row) => [
      ...exportFields.map((field) => valueForField(row, field.id)),
      ...productionSpecificationExportValues(row.item, catalogue),
    ]),
  ]
}

function valueForField(
  row: WorkOrderExportRow,
  fieldId: WorkOrderSummaryFieldConfig['id'],
): string | number | null {
  const item = row.item
  const values: Record<WorkOrderSummaryFieldConfig['id'], string | number | null> = {
    client: row.companyName ? `${row.clientName} (${row.companyName})` : row.clientName,
    jobNumber: row.jobNumber,
    jobAddress: row.jobAddress,
    leadScore: row.leadScore,
    item: item
      ? item.manualLabelOverride ?? item.generatedLabel ?? item.originalDescription
      : null,
    importance: item?.importance ?? null,
    risk: item?.riskLevel ?? null,
    installer: item?.installerName ?? null,
    stage: item?.stageName ?? null,
    hardware: item?.hardwareStatusName ?? null,
    maintenanceProgram: item ? (item.maintenanceProgram ? 'Yes' : 'No') : null,
    installDate: item?.installDate ?? null,
    dateCompleted: item?.dateCompleted ?? null,
    servicem8Status: row.servicem8Status,
    jobDescription: row.jobDescription,
  }

  return values[fieldId]
}

function productionSpecificationExportValues(
  item: WorkOrderItemSummaryRow | null,
  catalogue: readonly ProductionSpecificationCatalogueOption[],
): Array<string | null> {
  const reviewStatus = productionSpecificationReviewStatus(item)
  const persisted = item?.productionSpecification
  if (!persisted?.confirmedData) {
    return [reviewStatus, ...Array(SPECIFICATION_EXPORT_HEADINGS.length - 1).fill(null)]
  }

  try {
    const specification = parsePersistedProductionSpecification(persisted.confirmedData, catalogue)
    return [
      reviewStatus,
      persisted.productionLabel,
      ...PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS.map(({ field }) => (
        productionSpecificationValueLabel(specification[field], catalogue)
      )),
      formatMeasurements(specification),
      formatAdditionalComponents(specification),
      formatSpecialRequirements(specification),
    ]
  } catch {
    return [reviewStatus, persisted.productionLabel, ...Array(SPECIFICATION_EXPORT_HEADINGS.length - 2).fill(null)]
  }
}

function productionSpecificationReviewStatus(item: WorkOrderItemSummaryRow | null) {
  if (!item) return null
  if (item.productionSpecification?.status === 'confirmed') return 'Confirmed'
  if (item.productionSpecification?.status === 'needs_review') return 'Needs Review'
  if (item.enrichmentStatus?.status === 'queued') return 'Queued'
  if (item.enrichmentStatus?.status === 'processing') return 'Processing'
  if (item.enrichmentStatus?.status === 'failed') return 'Enrichment Failed'
  return 'Not Started'
}

function formatMeasurements(specification: ProductionSpecification) {
  return nullableJoined(specification.measurements.map((measurement) => {
    const value = `${measurement.value} ${measurement.unit}`
    return measurement.label ? `${measurement.label}: ${value}` : `${sentenceCase(measurement.kind)}: ${value}`
  }))
}

function formatAdditionalComponents(specification: ProductionSpecification) {
  return nullableJoined(specification.additionalComponents.map((component) => [
    component.name,
    component.quantity ? `Qty ${component.quantity}` : null,
    component.dimensions,
    component.material,
    component.finish,
    component.notes,
  ].filter(Boolean).join(' | ')))
}

function formatSpecialRequirements(specification: ProductionSpecification) {
  return nullableJoined(specification.specialRequirements.map((requirement) => (
    `${sentenceCase(requirement.kind)}: ${requirement.detail}`
  )))
}

function nullableJoined(values: string[]) {
  return values.length > 0 ? values.join('; ') : null
}

function sentenceCase(value: string) {
  const words = value.replaceAll('_', ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}
