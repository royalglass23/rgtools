import type { WorkOrderExportRow } from './queries'
import type { WorkOrderSummaryFieldConfig } from './summary-config'

export type { WorkOrderExportRow } from './queries'

const REQUIRED_EXPORT_FIELDS = new Set<WorkOrderSummaryFieldConfig['id']>([
  'jobNumber',
  'client',
  'jobAddress',
  'leadScore',
  'item',
])

export function buildWorkOrderExportTable(
  rows: WorkOrderExportRow[],
  fields: WorkOrderSummaryFieldConfig[],
) {
  const exportFields = fields
    .filter((field) => field.visible || REQUIRED_EXPORT_FIELDS.has(field.id))
    .sort((left, right) => left.order - right.order)

  return [
    exportFields.map((field) => field.label),
    ...rows.map((row) => exportFields.map((field) => valueForField(row, field.id))),
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
