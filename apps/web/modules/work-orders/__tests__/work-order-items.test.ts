import { describe, expect, it } from 'vitest'

import { applyWorkOrderItemListFilters, attachActiveItemsToWorkOrders } from '../work-order-items'
import type { WorkOrderListFilters } from '../list-filters'

function itemOperationalDefaults() {
  return {
    installerId: null,
    installerName: null,
    stageOptionId: null,
    stageName: null,
    hardwareStatusOptionId: null,
    hardwareStatusName: null,
    maintenanceProgram: false,
    installDate: null,
    dateCompleted: null,
    riskLevel: null,
    importance: null,
  } as const
}

const listFilters: WorkOrderListFilters = {
  q: '',
  current: 'current',
  risk: 'all',
  importance: 'all',
  stage: 'all',
  hardware: 'all',
  maintenanceProgram: 'all',
  showRemovedItems: false,
  sort: 'lead_score_desc',
  page: 1,
  size: 5,
}

describe('attachActiveItemsToWorkOrders', () => {
  it('groups multiple children under one parent and retains an empty parent', () => {
    const rows = attachActiveItemsToWorkOrders(
      [{ id: 'work-order-1' }, { id: 'work-order-2' }],
      [
        {
          ...itemOperationalDefaults(),
          id: 'item-1',
          workOrderId: 'work-order-1',
          itemCode: 'GLASS-001',
          quantity: '1.000',
          originalDescription: 'Shower glass',
          lineTotalExcludingGst: '900.00',
          generatedLabel: null,
          manualLabelOverride: null,
          isActive: true,
        },
        {
          ...itemOperationalDefaults(),
          id: 'item-2',
          workOrderId: 'work-order-1',
          itemCode: 'HARDWARE-001',
          quantity: '2.000',
          originalDescription: 'Shower hardware',
          lineTotalExcludingGst: '150.00',
          generatedLabel: null,
          manualLabelOverride: null,
          isActive: true,
        },
      ],
    )

    expect(rows).toEqual([
      expect.objectContaining({ id: 'work-order-1', activeItemCount: 2, items: expect.any(Array) }),
      expect.objectContaining({ id: 'work-order-2', activeItemCount: 0, items: [] }),
    ])
    expect(rows[0].items).toHaveLength(2)
  })

  it('keeps removed rows visible without adding them to the active item count', () => {
    const [workOrder] = attachActiveItemsToWorkOrders(
      [{ id: 'work-order-1' }],
      [
        { ...itemOperationalDefaults(), id: 'item-active', workOrderId: 'work-order-1', itemCode: 'GLASS-001', quantity: '1.000', originalDescription: 'Current glass', lineTotalExcludingGst: '900.00', generatedLabel: null, manualLabelOverride: null, isActive: true },
        { ...itemOperationalDefaults(), id: 'item-removed', workOrderId: 'work-order-1', itemCode: 'OLD-001', quantity: '1.000', originalDescription: 'Removed glass', lineTotalExcludingGst: '800.00', generatedLabel: null, manualLabelOverride: null, isActive: false },
      ],
    )

    expect(workOrder.activeItemCount).toBe(1)
    expect(workOrder.items).toHaveLength(2)
  })
})

describe('applyWorkOrderItemListFilters', () => {
  it('keeps every active child when search matches parent job context', () => {
    const items = [
      { ...itemOperationalDefaults(), id: 'item-glass', workOrderId: 'work-order-1', itemCode: 'GLASS-001', quantity: '1.000', originalDescription: 'Shower glass', lineTotalExcludingGst: '900.00', generatedLabel: 'Shower panel', manualLabelOverride: null, isActive: true },
      { ...itemOperationalDefaults(), id: 'item-hardware', workOrderId: 'work-order-1', itemCode: 'HARDWARE-001', quantity: '2.000', originalDescription: 'Hinge kit', lineTotalExcludingGst: '150.00', generatedLabel: 'Chrome hinges', manualLabelOverride: null, isActive: true },
    ]
    const [workOrder] = attachActiveItemsToWorkOrders([{
      id: 'work-order-1',
      clientName: 'Acme Construction',
      companyName: 'Acme Group',
      jobNumber: 'R260210',
      jobAddress: '10 Queen Street',
      jobDescription: 'Bathroom renovation',
    }], items)

    const [result] = applyWorkOrderItemListFilters([workOrder], { ...listFilters, q: 'R260210' })

    expect(result.items.map((item) => item.id)).toEqual(['item-glass', 'item-hardware'])
    expect(result.matchingActiveItemCount).toBeNull()
    expect(result.activeItemCount).toBe(2)
  })

  it('keeps the parent but narrows children and reports matching versus total active items', () => {
    const items = [
      { ...itemOperationalDefaults(), id: 'item-glass', workOrderId: 'work-order-1', itemCode: 'GLASS-001', quantity: '1.000', originalDescription: 'Shower glass', lineTotalExcludingGst: '900.00', generatedLabel: 'Shower panel', manualLabelOverride: null, isActive: true, stageOptionId: 'stage-ready' },
      { ...itemOperationalDefaults(), id: 'item-hardware', workOrderId: 'work-order-1', itemCode: 'HARDWARE-001', quantity: '2.000', originalDescription: 'Chrome hinge kit from ServiceM8', lineTotalExcludingGst: '150.00', generatedLabel: 'Hardware kit', manualLabelOverride: 'Staff hinge label', isActive: true, stageOptionId: 'stage-cutting' },
    ]
    const [workOrder] = attachActiveItemsToWorkOrders([{
      id: 'work-order-1',
      clientName: 'Acme Construction',
      companyName: null,
      jobNumber: 'R260210',
      jobAddress: '10 Queen Street',
      jobDescription: 'Bathroom renovation',
    }], items)

    const [searched] = applyWorkOrderItemListFilters([workOrder], { ...listFilters, q: 'chrome hinge' })
    expect(searched.items.map((item) => item.id)).toEqual(['item-hardware'])
    expect(searched.matchingActiveItemCount).toBe(1)
    expect(searched.activeItemCount).toBe(2)

    const [filtered] = applyWorkOrderItemListFilters([workOrder], { ...listFilters, stage: 'stage-ready' })
    expect(filtered.items.map((item) => item.id)).toEqual(['item-glass'])
    expect(filtered.matchingActiveItemCount).toBe(1)

    const [cleared] = applyWorkOrderItemListFilters([workOrder], listFilters)
    expect(cleared.items).toHaveLength(2)
    expect(cleared.matchingActiveItemCount).toBeNull()
  })
})
