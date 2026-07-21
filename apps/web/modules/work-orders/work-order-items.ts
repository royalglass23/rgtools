import type { WorkOrderListFilters } from './list-filters'

export type WorkOrderItemSummaryRow = {
  id: string
  workOrderId: string
  itemCode: string | null
  quantity: string
  originalDescription: string
  lineTotalExcludingGst: string | null
  generatedLabel: string | null
  manualLabelOverride: string | null
  labelStatus?: 'pending' | 'generated' | 'manual' | 'failed' | 'source_changed'
  sourceDescriptionFingerprint?: string | null
  isActive: boolean
  installerId: string | null
  installerName: string | null
  stageOptionId: string | null
  stageName: string | null
  hardwareStatusOptionId: string | null
  hardwareStatusName: string | null
  maintenanceProgram: boolean
  installDate: string | null
  dateCompleted: string | null
  riskLevel: 'low' | 'medium' | 'high' | null
  importance: 'low' | 'medium' | 'high' | null
}

export type PersistedWorkOrderItemSummaryRow = WorkOrderItemSummaryRow

export function attachActiveItemsToWorkOrders<T extends { id: string }>(
  workOrders: T[],
  items: PersistedWorkOrderItemSummaryRow[],
): Array<T & { activeItemCount: number; items: WorkOrderItemSummaryRow[] }> {
  const itemsByWorkOrderId = new Map<string, WorkOrderItemSummaryRow[]>()

  for (const item of items) {
    const groupedItems = itemsByWorkOrderId.get(item.workOrderId) ?? []
    const summaryItem: WorkOrderItemSummaryRow = {
      id: item.id,
      workOrderId: item.workOrderId,
      itemCode: item.itemCode,
      quantity: item.quantity,
      originalDescription: item.originalDescription,
      lineTotalExcludingGst: item.lineTotalExcludingGst,
      generatedLabel: item.generatedLabel,
      manualLabelOverride: item.manualLabelOverride,
      labelStatus: item.labelStatus,
      sourceDescriptionFingerprint: item.sourceDescriptionFingerprint,
      isActive: item.isActive,
      installerId: item.installerId,
      installerName: item.installerName,
      stageOptionId: item.stageOptionId,
      stageName: item.stageName,
      hardwareStatusOptionId: item.hardwareStatusOptionId,
      hardwareStatusName: item.hardwareStatusName,
      maintenanceProgram: item.maintenanceProgram,
      installDate: item.installDate,
      dateCompleted: item.dateCompleted,
      riskLevel: item.riskLevel,
      importance: item.importance,
    }
    groupedItems.push(summaryItem)
    itemsByWorkOrderId.set(item.workOrderId, groupedItems)
  }

  return workOrders.map((workOrder) => {
    const workOrderItems = itemsByWorkOrderId.get(workOrder.id) ?? []
    return {
      ...workOrder,
      activeItemCount: workOrderItems.filter((item) => item.isActive).length,
      items: workOrderItems,
    }
  })
}

type WorkOrderItemListParent = {
  clientName: string
  companyName: string | null
  jobNumber: string | null
  jobAddress: string | null
  jobDescription: string | null
  activeItemCount: number
  items: WorkOrderItemSummaryRow[]
}

export function applyWorkOrderItemListFilters<T extends WorkOrderItemListParent>(
  workOrders: T[],
  filters: WorkOrderListFilters,
): Array<T & { matchingActiveItemCount: number | null }> {
  const query = filters.q.trim().toLocaleLowerCase()
  const hasItemFilters = filters.risk !== 'all'
    || filters.importance !== 'all'
    || filters.stage !== 'all'
    || filters.hardware !== 'all'
    || filters.maintenanceProgram !== 'all'

  return workOrders.map((workOrder) => {
    const parentMatchesSearch = query !== '' && parentSearchValues(workOrder)
      .some((value) => value.toLocaleLowerCase().includes(query))
    const items = workOrder.items.filter((item) => {
      if (!matchesConfiguredItemFilters(item, filters)) return false
      if (!query || parentMatchesSearch) return true
      return itemSearchValues(item).some((value) => value.toLocaleLowerCase().includes(query))
    })
    const childrenAreNarrowed = hasItemFilters || Boolean(query && !parentMatchesSearch)

    return {
      ...workOrder,
      items,
      matchingActiveItemCount: childrenAreNarrowed
        ? items.filter((item) => item.isActive).length
        : null,
    }
  })
}

function matchesConfiguredItemFilters(item: WorkOrderItemSummaryRow, filters: WorkOrderListFilters) {
  if (filters.risk !== 'all' && item.riskLevel !== filters.risk) return false
  if (filters.importance !== 'all' && item.importance !== filters.importance) return false
  if (filters.stage !== 'all' && item.stageOptionId !== filters.stage) return false
  if (filters.hardware !== 'all' && item.hardwareStatusOptionId !== filters.hardware) return false
  if (filters.maintenanceProgram !== 'all') {
    const expected = filters.maintenanceProgram === 'yes'
    if (item.maintenanceProgram !== expected) return false
  }
  return true
}

function parentSearchValues(workOrder: WorkOrderItemListParent) {
  return [
    workOrder.clientName,
    workOrder.companyName,
    workOrder.jobNumber,
    workOrder.jobAddress,
    workOrder.jobDescription,
  ].filter((value): value is string => Boolean(value))
}

function itemSearchValues(item: WorkOrderItemSummaryRow) {
  return [
    item.itemCode,
    item.manualLabelOverride ?? item.generatedLabel ?? item.originalDescription,
    item.originalDescription,
  ].filter((value): value is string => Boolean(value))
}
