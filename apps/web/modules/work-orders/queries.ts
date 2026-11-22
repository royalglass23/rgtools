import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@rgtools/db/schema'
import { clientContacts, clients, leads } from '@rgtools/db/schema-leads'
import {
  workOrderHardwareStatusOptions,
  workOrderEvents,
  workOrderItemEnrichmentJobs,
  workOrderItemProductionSpecificationRevisions,
  workOrderItemProductionSpecifications,
  workOrderInstallers,
  workOrderItems,
  workOrderRefreshRuns,
  workOrderSpecificationCatalogueOptions,
  workOrders,
  workOrderStageOptions,
  type WorkOrderItemEnrichmentStatusValue,
} from '@rgtools/db/schema-workorders'
import { fingerprintSourceDescription } from './item-label-lifecycle'
import type { WorkOrderLevel } from './domain'
import type { WorkOrderListFilters, WorkOrderSort, WorkOrderSortDirection } from './list-filters'
import {
  applyWorkOrderItemListFilters,
  attachActiveItemsToWorkOrders,
  type WorkOrderItemSummaryRow,
} from './work-order-items'
import type { WorkOrderRefreshStatusValue } from './WorkOrderRefreshStatus'
import {
  INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
  type ProductionSpecificationCatalogueOption,
} from './production-specifications'

export const WORK_ORDER_EXPORT_MAX_ROWS = 10_000

export type WorkOrderBaseRow = {
  id: string
  servicem8Status: string
  isCurrent: boolean
  jobNumber: string | null
  jobAddress: string | null
  jobDescription: string | null
  clientName: string
  companyName: string | null
  leadScore: number | null
  installerName: string | null
  stageName: string | null
  hardwareStatusName: string | null
  maintenanceProgram: boolean
  installDate: string | null
  dateCompleted: string | null
  riskLevel: WorkOrderLevel | null
  importance: WorkOrderLevel | null
  aiSuggestion: string | null
  aiSuggestionAt: Date | null
  clientContextSummary: string | null
  clientApproachNote: string | null
  updatedAt: Date
}

export type WorkOrderRow = WorkOrderBaseRow & {
  activeItemCount: number
  matchingActiveItemCount?: number | null
  items: WorkOrderItemSummaryRow[]
}

export type WorkOrderExportRow = WorkOrderBaseRow & {
  item: WorkOrderItemSummaryRow | null
}

export type WorkOrderDetail = WorkOrderBaseRow & {
  servicem8JobUuid: string | null
  servicem8Active: boolean
  clientId: string | null
  clientNotes: string | null
  leadId: string | null
  quoteId: string | null
  rawServiceM8Snapshot: unknown
  riskSource: 'manual' | 'ai' | null
  importanceSource: 'manual' | 'ai' | null
  items: WorkOrderItemSummaryRow[]
  contacts: Array<{
    id: string
    name: string | null
    phone: string | null
    email: string | null
    isJobContact: boolean
  }>
  timeline: Array<{
    id: string
    workOrderItemId: string | null
    itemCode: string | null
    itemLabel: string | null
    actorUsername: string | null
    fieldName: string
    previousValue: unknown
    newValue: unknown
    note: string | null
    isClientVisibleCandidate: boolean
    portalTitle: string | null
    portalMessage: string | null
    createdAt: Date
  }>
}

const workOrderRowSelection = {
  id: workOrders.id,
  servicem8Status: workOrders.servicem8Status,
  isCurrent: workOrders.isCurrent,
  jobNumber: workOrders.jobNumber,
  jobAddress: workOrders.jobAddress,
  jobDescription: workOrders.jobDescription,
  clientName: workOrders.clientName,
  companyName: workOrders.companyName,
  leadScore: workOrders.leadScore,
  installerName: workOrderInstallers.displayName,
  stageName: workOrderStageOptions.displayName,
  hardwareStatusName: workOrderHardwareStatusOptions.displayName,
  maintenanceProgram: workOrders.maintenanceProgram,
  installDate: workOrders.installDate,
  dateCompleted: workOrders.dateCompleted,
  riskLevel: sql<WorkOrderLevel | null>`coalesce(${workOrders.riskLevelOverride}, ${workOrders.aiRiskLevel})`,
  importance: sql<WorkOrderLevel | null>`coalesce(${workOrders.importanceOverride}, ${workOrders.aiImportance})`,
  aiSuggestion: workOrders.aiSuggestion,
  aiSuggestionAt: workOrders.aiSuggestionAt,
  clientContextSummary: workOrders.clientContextSummary,
  clientApproachNote: workOrders.clientApproachNote,
  updatedAt: workOrders.updatedAt,
}

const workOrderItemSummarySelection = {
  id: workOrderItems.id,
  workOrderId: workOrderItems.workOrderId,
  itemCode: workOrderItems.itemCode,
  quantity: workOrderItems.quantity,
  originalDescription: workOrderItems.originalDescription,
  lineTotalExcludingGst: workOrderItems.lineTotalExcludingGst,
  generatedLabel: workOrderItems.generatedLabel,
  manualLabelOverride: workOrderItems.manualLabelOverride,
  labelStatus: workOrderItems.labelStatus,
  sourceDescriptionFingerprint: workOrderItems.sourceDescriptionFingerprint,
  isActive: workOrderItems.isActive,
  installerId: workOrderItems.installerId,
  installerName: workOrderInstallers.displayName,
  stageOptionId: workOrderItems.stageOptionId,
  stageName: workOrderStageOptions.displayName,
  hardwareStatusOptionId: workOrderItems.hardwareStatusOptionId,
  hardwareStatusName: workOrderHardwareStatusOptions.displayName,
  maintenanceProgram: workOrderItems.maintenanceProgram,
  installDate: workOrderItems.installDate,
  dateCompleted: workOrderItems.dateCompleted,
  riskLevel: sql<WorkOrderLevel | null>`coalesce(${workOrderItems.riskLevelOverride}, ${workOrderItems.aiRiskLevel})`,
  importance: sql<WorkOrderLevel | null>`coalesce(${workOrderItems.importanceOverride}, ${workOrderItems.aiImportance})`,
  productionSpecification: {
    id: workOrderItemProductionSpecifications.id,
    status: workOrderItemProductionSpecifications.status,
    draftData: workOrderItemProductionSpecifications.draftData,
    confirmedData: workOrderItemProductionSpecifications.confirmedData,
    productionLabel: workOrderItemProductionSpecifications.productionLabel,
    confirmedAt: workOrderItemProductionSpecifications.confirmedAt,
    confirmedRevision: workOrderItemProductionSpecifications.confirmedRevision,
    draftRevision: workOrderItemProductionSpecifications.draftRevision,
    sourceDescription: workOrderItemProductionSpecifications.sourceDescription,
    sourceDescriptionFingerprint: workOrderItemProductionSpecifications.sourceDescriptionFingerprint,
    draftSourceDescription: workOrderItemProductionSpecifications.draftSourceDescription,
    draftSourceDescriptionFingerprint: workOrderItemProductionSpecifications.draftSourceDescriptionFingerprint,
    ignoredSourceDescriptionFingerprint: workOrderItemProductionSpecifications.ignoredSourceDescriptionFingerprint,
    evidenceData: workOrderItemProductionSpecifications.evidenceData,
    ambiguityFlags: workOrderItemProductionSpecifications.ambiguityFlags,
    history: sql<Array<{
      id: string
      revisionType: string
      actorUsername: string | null
      previousSnapshot: unknown
      newSnapshot: unknown
      reasonCode: string | null
      note: string | null
      createdAt: Date
    }>>`coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ${workOrderItemProductionSpecificationRevisions.id},
        'revisionType', ${workOrderItemProductionSpecificationRevisions.revisionType},
        'actorUsername', ${users.username},
        'previousSnapshot', ${workOrderItemProductionSpecificationRevisions.previousSnapshot},
        'newSnapshot', ${workOrderItemProductionSpecificationRevisions.newSnapshot},
        'reasonCode', ${workOrderItemProductionSpecificationRevisions.reasonCode},
        'note', ${workOrderItemProductionSpecificationRevisions.note},
        'changes', ${workOrderItemProductionSpecificationRevisions.changes},
        'createdAt', ${workOrderItemProductionSpecificationRevisions.createdAt}
      ) order by ${workOrderItemProductionSpecificationRevisions.createdAt} asc)
      from ${workOrderItemProductionSpecificationRevisions}
      left join ${users} on ${users.id} = ${workOrderItemProductionSpecificationRevisions.actorId}
      where ${workOrderItemProductionSpecificationRevisions.workOrderItemId} = ${workOrderItems.id}
    ), '[]'::jsonb)`,
  },
  enrichmentStatus: {
    status: sql<WorkOrderItemEnrichmentStatusValue | null>`(
      select ${workOrderItemEnrichmentJobs.status}
      from ${workOrderItemEnrichmentJobs}
      where ${workOrderItemEnrichmentJobs.workOrderItemId} = ${workOrderItems.id}
      order by ${workOrderItemEnrichmentJobs.createdAt} desc
      limit 1
    )`,
    lastSafeError: sql<string | null>`(
      select ${workOrderItemEnrichmentJobs.lastSafeError}
      from ${workOrderItemEnrichmentJobs}
      where ${workOrderItemEnrichmentJobs.workOrderItemId} = ${workOrderItems.id}
      order by ${workOrderItemEnrichmentJobs.createdAt} desc
      limit 1
    )`,
  },
}

export async function listWorkOrders(
  filters: WorkOrderListFilters,
  catalogue: readonly ProductionSpecificationCatalogueOption[] = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
) {
  const where = listWhere(filters)
  const offset = (filters.page - 1) * filters.size

  const [totalRow] = await db
    .select({ total: count() })
    .from(workOrders)
    .leftJoin(workOrderInstallers, eq(workOrders.installerId, workOrderInstallers.id))
    .leftJoin(workOrderStageOptions, eq(workOrders.stageOptionId, workOrderStageOptions.id))
    .leftJoin(workOrderHardwareStatusOptions, eq(workOrders.hardwareStatusOptionId, workOrderHardwareStatusOptions.id))
    .where(where)

  const rows = await db
    .select(workOrderRowSelection)
    .from(workOrders)
    .leftJoin(workOrderInstallers, eq(workOrders.installerId, workOrderInstallers.id))
    .leftJoin(workOrderStageOptions, eq(workOrders.stageOptionId, workOrderStageOptions.id))
    .leftJoin(workOrderHardwareStatusOptions, eq(workOrders.hardwareStatusOptionId, workOrderHardwareStatusOptions.id))
    .where(where)
    .orderBy(...listOrderBy(filters.sort))
    .limit(filters.size)
    .offset(offset)

  const activeItems = await listWorkOrderSummaryItems(
    rows.map((row) => row.id),
    filters.showRemovedItems,
  )

  const total = totalRow?.total ?? 0
  const groupedRows = attachActiveItemsToWorkOrders(rows, activeItems)
  return {
    rows: applyWorkOrderItemListFilters(groupedRows, filters, catalogue),
    total,
    pageCount: Math.max(1, Math.ceil(total / filters.size)),
  }
}

export async function listWorkOrdersForExport(
  filters: WorkOrderListFilters,
  catalogue: readonly ProductionSpecificationCatalogueOption[] = INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
): Promise<WorkOrderExportRow[]> {
  const rows = await db
    .select(workOrderRowSelection)
    .from(workOrders)
    .leftJoin(workOrderInstallers, eq(workOrders.installerId, workOrderInstallers.id))
    .leftJoin(workOrderStageOptions, eq(workOrders.stageOptionId, workOrderStageOptions.id))
    .leftJoin(workOrderHardwareStatusOptions, eq(workOrders.hardwareStatusOptionId, workOrderHardwareStatusOptions.id))
    .where(listWhere(filters))
    .orderBy(...listOrderBy(filters.sort))
    .limit(WORK_ORDER_EXPORT_MAX_ROWS + 1)

  if (rows.length > WORK_ORDER_EXPORT_MAX_ROWS) {
    throw new Error(
      `Work Order export exceeds the ${WORK_ORDER_EXPORT_MAX_ROWS}-row limit. Narrow the filters and try again.`,
    )
  }

  if (rows.length === 0) return []

  const items = await listWorkOrderSummaryItems(
    rows.map((row) => row.id),
    filters.showRemovedItems,
    WORK_ORDER_EXPORT_MAX_ROWS + 1,
  )

  if (items.length > WORK_ORDER_EXPORT_MAX_ROWS) {
    throw new Error(
      `Work Order export exceeds the ${WORK_ORDER_EXPORT_MAX_ROWS}-row limit. Narrow the filters and try again.`,
    )
  }

  const exportRows = applyWorkOrderItemListFilters(attachActiveItemsToWorkOrders(rows, items), filters, catalogue)
    .flatMap<WorkOrderExportRow>(({ items: matchingItems, activeItemCount, matchingActiveItemCount, ...workOrder }) => {
      void activeItemCount
      void matchingActiveItemCount
      return matchingItems.length > 0
        ? matchingItems.map((item) => ({ ...workOrder, item }))
        : [{ ...workOrder, item: null }]
    })

  if (exportRows.length > WORK_ORDER_EXPORT_MAX_ROWS) {
    throw new Error(
      `Work Order export exceeds the ${WORK_ORDER_EXPORT_MAX_ROWS}-row limit. Narrow the filters and try again.`,
    )
  }

  return exportRows
}

async function listWorkOrderSummaryItems(
  workOrderIds: string[],
  showRemovedItems: boolean,
  limit?: number,
) {
  if (workOrderIds.length === 0) return []

  const query = db
    .select(workOrderItemSummarySelection)
    .from(workOrderItems)
    .leftJoin(workOrderInstallers, eq(workOrderItems.installerId, workOrderInstallers.id))
    .leftJoin(workOrderStageOptions, eq(workOrderItems.stageOptionId, workOrderStageOptions.id))
    .leftJoin(workOrderHardwareStatusOptions, eq(workOrderItems.hardwareStatusOptionId, workOrderHardwareStatusOptions.id))
    .leftJoin(
      workOrderItemProductionSpecifications,
      eq(workOrderItems.id, workOrderItemProductionSpecifications.workOrderItemId),
    )
    .where(showRemovedItems
      ? inArray(workOrderItems.workOrderId, workOrderIds)
      : and(
        inArray(workOrderItems.workOrderId, workOrderIds),
        eq(workOrderItems.isActive, true),
      ))
    .orderBy(asc(workOrderItems.workOrderId), asc(workOrderItems.sortOrder), asc(workOrderItems.id))

  const rows = await (limit === undefined ? query : query.limit(limit))
  return rows.map((row) => {
    if (!('productionSpecification' in row)) return row
    const enrichmentStatus = row.enrichmentStatus?.status
    return {
      ...row,
      productionSpecification: row.productionSpecification?.id
        ? sourceComparisonSummary(row.originalDescription, row.productionSpecification)
        : null,
      enrichmentStatus: enrichmentStatus
        ? {
          status: enrichmentStatus,
          lastSafeError: row.enrichmentStatus.lastSafeError,
        }
        : null,
    }
  })
}

function sourceComparisonSummary<T extends {
  confirmedData: unknown
  sourceDescription: string | null
  sourceDescriptionFingerprint: string | null
  ignoredSourceDescriptionFingerprint: string | null
}>(currentSourceDescription: string, specification: T) {
  const currentSourceDescriptionFingerprint = fingerprintSourceDescription(currentSourceDescription)
  const sourceDiffers = specification.sourceDescriptionFingerprint
    ? specification.sourceDescriptionFingerprint !== currentSourceDescriptionFingerprint
    : specification.sourceDescription !== null && specification.sourceDescription !== currentSourceDescription
  return {
    ...specification,
    currentSourceDescriptionFingerprint,
    sourceChanged: Boolean(
      specification.confirmedData
      && sourceDiffers
      && specification.ignoredSourceDescriptionFingerprint !== currentSourceDescriptionFingerprint
    ),
  }
}

export async function getWorkOrderFilterOptions() {
  const [installers, stages, hardwareStatuses, statuses] = await Promise.all([
    db
      .select({ id: workOrderInstallers.id, label: workOrderInstallers.displayName })
      .from(workOrderInstallers)
      .where(eq(workOrderInstallers.isActive, true))
      .orderBy(asc(workOrderInstallers.displayName)),
    db
      .select({ id: workOrderStageOptions.id, label: workOrderStageOptions.displayName })
      .from(workOrderStageOptions)
      .where(eq(workOrderStageOptions.isActive, true))
      .orderBy(asc(workOrderStageOptions.sortOrder), asc(workOrderStageOptions.displayName)),
    db
      .select({ id: workOrderHardwareStatusOptions.id, label: workOrderHardwareStatusOptions.displayName })
      .from(workOrderHardwareStatusOptions)
      .where(eq(workOrderHardwareStatusOptions.isActive, true))
      .orderBy(asc(workOrderHardwareStatusOptions.sortOrder), asc(workOrderHardwareStatusOptions.displayName)),
    db
      .select({ status: workOrders.servicem8Status })
      .from(workOrders)
      .groupBy(workOrders.servicem8Status)
      .orderBy(asc(workOrders.servicem8Status)),
  ])

  return {
    installers,
    stages,
    hardwareStatuses,
    statuses: statuses.map((row: { status: string }) => row.status),
  }
}

export async function getWorkOrderConfigLists() {
  const [installers, stages, hardwareStatuses] = await Promise.all([
    db.select().from(workOrderInstallers).orderBy(asc(workOrderInstallers.displayName)),
    db.select().from(workOrderStageOptions).orderBy(asc(workOrderStageOptions.sortOrder), asc(workOrderStageOptions.displayName)),
    db.select().from(workOrderHardwareStatusOptions).orderBy(asc(workOrderHardwareStatusOptions.sortOrder), asc(workOrderHardwareStatusOptions.displayName)),
  ])

  return { installers, stages, hardwareStatuses }
}

export async function getWorkOrderRefreshStatus(): Promise<WorkOrderRefreshStatusValue> {
  const [successfulRows, failedRows] = await Promise.all([
    db
      .select({
        createdAt: workOrderRefreshRuns.createdAt,
        jobCount: workOrderRefreshRuns.syncedCount,
        itemCount: workOrderRefreshRuns.itemSyncedCount,
        excludedLineCount: workOrderRefreshRuns.excludedLineCount,
      })
      .from(workOrderRefreshRuns)
      .where(eq(workOrderRefreshRuns.status, 'success'))
      .orderBy(desc(workOrderRefreshRuns.createdAt))
      .limit(1),
    db
      .select({ createdAt: workOrderRefreshRuns.createdAt, errorMessage: workOrderRefreshRuns.errorMessage })
      .from(workOrderRefreshRuns)
      .where(eq(workOrderRefreshRuns.status, 'failed'))
      .orderBy(desc(workOrderRefreshRuns.createdAt))
      .limit(1),
  ])

  const latestSuccess = successfulRows[0] ?? null
  const latestFailure = failedRows[0] ?? null
  const hasNewerFailure = latestFailure && (
    !latestSuccess || latestFailure.createdAt.getTime() > latestSuccess.createdAt.getTime()
  )

  return {
    lastSuccessfulAt: latestSuccess?.createdAt ?? null,
    lastSuccessfulJobCount: latestSuccess?.jobCount ?? 0,
    lastSuccessfulItemCount: latestSuccess?.itemCount ?? 0,
    lastSuccessfulExcludedLineCount: latestSuccess?.excludedLineCount ?? 0,
    latestFailure: hasNewerFailure
      ? { at: latestFailure.createdAt, message: latestFailure.errorMessage ?? 'ServiceM8 refresh failed.' }
      : null,
  }
}

export async function getWorkOrderDetail(workOrderId: string): Promise<WorkOrderDetail | null> {
  const [row] = await db
    .select({
      id: workOrders.id,
      servicem8Status: workOrders.servicem8Status,
      servicem8Active: workOrders.servicem8Active,
      servicem8JobUuid: workOrders.servicem8JobUuid,
      isCurrent: workOrders.isCurrent,
      jobNumber: workOrders.jobNumber,
      jobAddress: workOrders.jobAddress,
      jobDescription: workOrders.jobDescription,
      clientName: workOrders.clientName,
      companyName: workOrders.companyName,
      clientId: workOrders.clientId,
      clientNotes: clients.notes,
      leadId: workOrders.leadId,
      quoteId: workOrders.quoteId,
      leadScore: workOrders.leadScore,
      installerName: workOrderInstallers.displayName,
      stageName: workOrderStageOptions.displayName,
      hardwareStatusName: workOrderHardwareStatusOptions.displayName,
      maintenanceProgram: workOrders.maintenanceProgram,
      installDate: workOrders.installDate,
      dateCompleted: workOrders.dateCompleted,
      riskLevel: sql<WorkOrderLevel | null>`coalesce(${workOrders.riskLevelOverride}, ${workOrders.aiRiskLevel})`,
      importance: sql<WorkOrderLevel | null>`coalesce(${workOrders.importanceOverride}, ${workOrders.aiImportance})`,
      riskSource: sql<'manual' | 'ai' | null>`case when ${workOrders.riskLevelOverride} is not null then 'manual' when ${workOrders.aiRiskLevel} is not null then 'ai' else null end`,
      importanceSource: sql<'manual' | 'ai' | null>`case when ${workOrders.importanceOverride} is not null then 'manual' when ${workOrders.aiImportance} is not null then 'ai' else null end`,
      aiSuggestion: workOrders.aiSuggestion,
      aiSuggestionAt: workOrders.aiSuggestionAt,
      clientContextSummary: workOrders.clientContextSummary,
      clientApproachNote: workOrders.clientApproachNote,
      rawServiceM8Snapshot: workOrders.rawServiceM8Snapshot,
      updatedAt: workOrders.updatedAt,
    })
    .from(workOrders)
    .leftJoin(clients, eq(workOrders.clientId, clients.id))
    .leftJoin(workOrderInstallers, eq(workOrders.installerId, workOrderInstallers.id))
    .leftJoin(workOrderStageOptions, eq(workOrders.stageOptionId, workOrderStageOptions.id))
    .leftJoin(workOrderHardwareStatusOptions, eq(workOrders.hardwareStatusOptionId, workOrderHardwareStatusOptions.id))
    .where(eq(workOrders.id, workOrderId))
    .limit(1)

  if (!row) return null

  const [contacts, timeline, items] = await Promise.all([
    row.clientId
      ? db
        .select({
          id: clientContacts.id,
          name: clientContacts.name,
          phone: clientContacts.phone,
          email: clientContacts.email,
          isJobContact: sql<boolean>`${clientContacts.id} = ${leads.contactId}`,
        })
        .from(clientContacts)
        .leftJoin(leads, eq(leads.id, row.leadId ?? ''))
        .where(eq(clientContacts.clientId, row.clientId))
        .orderBy(asc(clientContacts.name), asc(clientContacts.email))
      : Promise.resolve([]),
    db
      .select({
        id: workOrderEvents.id,
        workOrderItemId: workOrderEvents.workOrderItemId,
        itemCode: workOrderItems.itemCode,
        itemLabel: sql<string | null>`coalesce(${workOrderItems.manualLabelOverride}, ${workOrderItems.generatedLabel}, ${workOrderItems.originalDescription})`,
        actorUsername: users.username,
        fieldName: workOrderEvents.fieldName,
        previousValue: workOrderEvents.previousValue,
        newValue: workOrderEvents.newValue,
        note: workOrderEvents.note,
        isClientVisibleCandidate: workOrderEvents.isClientVisibleCandidate,
        portalTitle: workOrderEvents.portalTitle,
        portalMessage: workOrderEvents.portalMessage,
        createdAt: workOrderEvents.createdAt,
      })
      .from(workOrderEvents)
      .leftJoin(workOrderItems, eq(workOrderEvents.workOrderItemId, workOrderItems.id))
      .leftJoin(users, eq(workOrderEvents.actorId, users.id))
      .where(eq(workOrderEvents.workOrderId, workOrderId))
      .orderBy(desc(workOrderEvents.createdAt)),
    listWorkOrderSummaryItems([workOrderId], true),
  ])

  return { ...row, contacts, timeline, items }
}

function listWhere(filters: WorkOrderListFilters) {
  const conditions = []

  if (filters.current === 'current') conditions.push(eq(workOrders.isCurrent, true))
  if (filters.current === 'non_current') conditions.push(eq(workOrders.isCurrent, false))
  if (hasConfiguredItemFilters(filters)) conditions.push(matchingItemExists(filters))
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`
    conditions.push(or(
      ilike(workOrders.clientName, pattern),
      ilike(workOrders.companyName, pattern),
      ilike(workOrders.jobNumber, pattern),
      ilike(workOrders.jobAddress, pattern),
      ilike(workOrders.jobDescription, pattern),
      matchingItemExists(filters, pattern),
    ))
  }

  return conditions.length > 0 ? and(...conditions) : undefined
}

function matchingItemExists(filters: WorkOrderListFilters, searchPattern?: string) {
  const conditions = [eq(workOrderItems.workOrderId, workOrders.id)]
  if (!filters.showRemovedItems) conditions.push(eq(workOrderItems.isActive, true))
  if (filters.stage !== 'all') conditions.push(eq(workOrderItems.stageOptionId, filters.stage))
  if (filters.hardware !== 'all') conditions.push(eq(workOrderItems.hardwareStatusOptionId, filters.hardware))
  if (filters.maintenanceProgram !== 'all') {
    conditions.push(eq(workOrderItems.maintenanceProgram, filters.maintenanceProgram === 'yes'))
  }
  if (filters.risk !== 'all') {
    conditions.push(eq(sql`coalesce(${workOrderItems.riskLevelOverride}, ${workOrderItems.aiRiskLevel})`, filters.risk))
  }
  if (filters.importance !== 'all') {
    conditions.push(eq(sql`coalesce(${workOrderItems.importanceOverride}, ${workOrderItems.aiImportance})`, filters.importance))
  }
  for (const [field, catalogueId] of Object.entries(filters.specification ?? {})) {
    conditions.push(sql`exists (
      select 1
      from ${workOrderItemProductionSpecifications} as current_specification
      where current_specification.work_order_item_id = ${workOrderItems.id}
        and current_specification.confirmed_data -> ${field} ->> 'state' = 'selected'
        and current_specification.confirmed_data -> ${field} ->> 'catalogueId' = ${catalogueId}
    )`)
  }
  if (searchPattern) {
    const itemSearchCondition = or(
      ilike(workOrderItems.itemCode, searchPattern),
      ilike(
        sql<string>`coalesce(${workOrderItems.manualLabelOverride}, ${workOrderItems.generatedLabel}, ${workOrderItems.originalDescription})`,
        searchPattern,
      ),
      ilike(workOrderItems.originalDescription, searchPattern),
      currentProductionSpecificationSearchExists(searchPattern),
    )
    if (itemSearchCondition) conditions.push(itemSearchCondition)
  }

  return sql`exists (select 1 from ${workOrderItems} where ${and(...conditions)})`
}

function hasConfiguredItemFilters(filters: WorkOrderListFilters) {
  return filters.stage !== 'all'
    || filters.hardware !== 'all'
    || filters.maintenanceProgram !== 'all'
    || filters.risk !== 'all'
    || filters.importance !== 'all'
    || Object.keys(filters.specification ?? {}).length > 0
}

function currentProductionSpecificationSearchExists(searchPattern: string) {
  return sql`exists (
    select 1
    from ${workOrderItemProductionSpecifications} as current_specification
    where current_specification.work_order_item_id = ${workOrderItems.id}
      and current_specification.confirmed_data is not null
      and (
        current_specification.production_label ilike ${searchPattern}
        or exists (
          select 1
          from ${workOrderSpecificationCatalogueOptions} as catalogue_option
          where catalogue_option.display_label ilike ${searchPattern}
            and current_specification.confirmed_data
              -> catalogue_option.field_name
              ->> 'catalogueId' = catalogue_option.id
        )
        or exists (
          select 1
          from jsonb_each(current_specification.confirmed_data) as specification_field(field_name, field_value)
          where (
            specification_field.field_value ->> 'state' = 'tbc'
            and 'TBC' ilike ${searchPattern}
          ) or (
            specification_field.field_value ->> 'state' = 'unmapped'
            and concat('Unmapped - ', specification_field.field_value ->> 'raw') ilike ${searchPattern}
          )
        )
        or exists (
          select 1
          from jsonb_array_elements(coalesce(current_specification.confirmed_data -> 'measurements', '[]'::jsonb)) as measurement(value)
          where measurement.value ->> 'label' ilike ${searchPattern}
            or measurement.value ->> 'kind' ilike ${searchPattern}
            or measurement.value ->> 'value' ilike ${searchPattern}
            or measurement.value ->> 'unit' ilike ${searchPattern}
        )
        or exists (
          select 1
          from jsonb_array_elements(coalesce(current_specification.confirmed_data -> 'additionalComponents', '[]'::jsonb)) as component(value)
          where component.value ->> 'name' ilike ${searchPattern}
            or component.value ->> 'quantity' ilike ${searchPattern}
            or component.value ->> 'dimensions' ilike ${searchPattern}
            or component.value ->> 'material' ilike ${searchPattern}
            or component.value ->> 'finish' ilike ${searchPattern}
            or component.value ->> 'notes' ilike ${searchPattern}
        )
        or exists (
          select 1
          from jsonb_array_elements(coalesce(current_specification.confirmed_data -> 'specialRequirements', '[]'::jsonb)) as requirement(value)
          where requirement.value ->> 'kind' ilike ${searchPattern}
            or requirement.value ->> 'detail' ilike ${searchPattern}
        )
      )
  )`
}

function listOrderBy(sort: WorkOrderSort) {
  if (sort === 'lead_score_desc') {
    return [
      sql`${workOrders.leadScore} desc nulls last`,
      sortLevel(activeItemLevelRank(workOrderItems.importanceOverride, workOrderItems.aiImportance), 'desc'),
      sortLevel(activeItemLevelRank(workOrderItems.riskLevelOverride, workOrderItems.aiRiskLevel), 'desc'),
      sortNullable(activeItemDateAggregate(workOrderItems.installDate, 'asc'), 'asc'),
      asc(workOrders.updatedAt),
      asc(workOrders.id),
    ]
  }
  if (sort === 'lead_score_asc') {
    return [
      sql`${workOrders.leadScore} asc nulls last`,
      asc(workOrders.clientName),
      asc(workOrders.updatedAt),
      asc(workOrders.id),
    ]
  }

  const [key, direction] = splitSort(sort)

  if (key === 'importance') return [sortLevel(activeItemLevelRank(workOrderItems.importanceOverride, workOrderItems.aiImportance), direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'risk') return [sortLevel(activeItemLevelRank(workOrderItems.riskLevelOverride, workOrderItems.aiRiskLevel), direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'install_date') return [sortNullable(activeItemDateAggregate(workOrderItems.installDate, direction), direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'date_completed') return [sortNullable(activeItemDateAggregate(workOrderItems.dateCompleted, direction), direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'client') return [sortText(workOrders.clientName, direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'job_number') return [sortText(workOrders.jobNumber, direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'job_address') return [sortText(workOrders.jobAddress, direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'job_description') return [sortText(workOrders.jobDescription, direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'installer') return [sortText(workOrderInstallers.displayName, direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'stage') return [sortText(workOrderStageOptions.displayName, direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'hardware') return [sortText(workOrderHardwareStatusOptions.displayName, direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'maintenance_program') return [sortNullable(workOrders.maintenanceProgram, direction), desc(workOrders.leadScore), asc(workOrders.id)]
  if (key === 'servicem8_status') return [sortText(workOrders.servicem8Status, direction), desc(workOrders.leadScore), asc(workOrders.id)]

  return [
    sql`${workOrders.leadScore} desc nulls last`,
    sortLevel(activeItemLevelRank(workOrderItems.importanceOverride, workOrderItems.aiImportance), 'desc'),
    sortLevel(activeItemLevelRank(workOrderItems.riskLevelOverride, workOrderItems.aiRiskLevel), 'desc'),
    sortNullable(activeItemDateAggregate(workOrderItems.installDate, 'asc'), 'asc'),
    asc(workOrders.updatedAt),
    asc(workOrders.id),
  ]
}

function splitSort(sort: WorkOrderSort): [string, WorkOrderSortDirection] {
  const direction = sort.endsWith('_asc') ? 'asc' : 'desc'
  return [sort.slice(0, -`_${direction}`.length), direction]
}

function sortNullable(column: unknown, direction: WorkOrderSortDirection) {
  return direction === 'asc' ? sql`${column} asc nulls last` : sql`${column} desc nulls last`
}

function sortText(column: unknown, direction: WorkOrderSortDirection) {
  return direction === 'asc' ? sql`lower(${column}) asc nulls last` : sql`lower(${column}) desc nulls last`
}

function sortLevel(column: unknown, direction: WorkOrderSortDirection) {
  return direction === 'asc' ? sql`${column} asc nulls last` : sql`${column} desc nulls last`
}

function levelRank(overrideColumn: unknown, aiColumn: unknown) {
  return sql<number>`case coalesce(${overrideColumn}, ${aiColumn})
    when 'high' then 3
    when 'medium' then 2
    when 'low' then 1
    else 0
  end`
}

function activeItemLevelRank(overrideColumn: unknown, aiColumn: unknown) {
  return sql<number>`(select max(${levelRank(overrideColumn, aiColumn)})
    from ${workOrderItems}
    where ${workOrderItems.workOrderId} = ${workOrders.id}
      and ${workOrderItems.isActive} = true)`
}

function activeItemDateAggregate(column: unknown, direction: WorkOrderSortDirection) {
  if (direction === 'asc') {
    return sql`(select min(${column})
      from ${workOrderItems}
      where ${workOrderItems.workOrderId} = ${workOrders.id}
        and ${workOrderItems.isActive} = true)`
  }

  return sql`(select max(${column})
    from ${workOrderItems}
    where ${workOrderItems.workOrderId} = ${workOrders.id}
      and ${workOrderItems.isActive} = true)`
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export async function findLinkedLeadAndClient(input: {
  servicem8JobUuid: string | null
  jobNumber: string | null
}) {
  const conditions = []
  if (input.servicem8JobUuid) conditions.push(eq(leads.servicem8JobUuid, input.servicem8JobUuid))
  if (input.jobNumber) conditions.push(eq(leads.servicem8JobNumber, input.jobNumber))
  if (conditions.length === 0) return null

  const [row] = await db
    .select({
      leadId: leads.id,
      clientId: clients.id,
      clientName: clients.name,
      companyName: clients.companyName,
      leadScore: leads.seedScore,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .limit(1)

  return row ?? null
}
