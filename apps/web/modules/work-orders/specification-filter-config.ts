import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@rgtools/db/schema'
import {
  PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS,
  isProductionSpecificationFieldName,
  type ProductionSpecificationFieldName,
} from './production-specifications'

export const WORK_ORDER_SPECIFICATION_FILTER_CONFIG_KEY = 'work_orders.production_specification_filters'

export type WorkOrderSpecificationFilterConfig = {
  field: ProductionSpecificationFieldName
  enabled: boolean
  order: number
}

export async function getWorkOrderSpecificationFilterConfig() {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, WORK_ORDER_SPECIFICATION_FILTER_CONFIG_KEY))
    .limit(1)

  return row
    ? normalizeWorkOrderSpecificationFilterConfig(row.value)
    : defaultWorkOrderSpecificationFilterConfig()
}

export function normalizeWorkOrderSpecificationFilterConfig(raw: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaultWorkOrderSpecificationFilterConfig()
  }

  if (!Array.isArray(parsed)) return defaultWorkOrderSpecificationFilterConfig()

  const saved: WorkOrderSpecificationFilterConfig[] = []
  const knownFields = new Set<ProductionSpecificationFieldName>()
  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== 'object') continue
    const row = candidate as Record<string, unknown>
    const field = String(row.field)
    if (!isProductionSpecificationFieldName(field) || knownFields.has(field)) continue
    saved.push({
      field,
      enabled: row.enabled === true,
      order: typeof row.order === 'number' && Number.isFinite(row.order) ? row.order : saved.length + 1,
    })
    knownFields.add(field)
  }
  saved.sort((left, right) => left.order - right.order)

  for (const { field } of PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS) {
    if (knownFields.has(field)) continue
    saved.push({ field, enabled: false, order: saved.length + 1 })
  }

  return saved.map((field, index) => ({ ...field, order: index + 1 }))
}

export function serializeWorkOrderSpecificationFilterConfig(
  fields: readonly WorkOrderSpecificationFilterConfig[],
) {
  return JSON.stringify(fields.map(({ field, enabled, order }) => ({ field, enabled, order })))
}

export async function saveWorkOrderSpecificationFilterConfig(
  fields: readonly WorkOrderSpecificationFilterConfig[],
  updatedBy: string | null,
) {
  const value = serializeWorkOrderSpecificationFilterConfig(fields)
  await db
    .insert(settings)
    .values({
      key: WORK_ORDER_SPECIFICATION_FILTER_CONFIG_KEY,
      value,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedBy, updatedAt: new Date() },
    })
}

function defaultWorkOrderSpecificationFilterConfig(): WorkOrderSpecificationFilterConfig[] {
  return PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS.map(({ field }, index) => ({
    field,
    enabled: false,
    order: index + 1,
  }))
}
