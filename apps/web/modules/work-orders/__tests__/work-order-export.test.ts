import { describe, expect, it } from 'vitest'

import { buildWorkOrderExportTable, type WorkOrderExportRow } from '../work-order-export'
import type { WorkOrderSummaryFieldConfig } from '../summary-config'
import type { WorkOrderItemSummaryRow } from '../work-order-items'

function field(
  id: WorkOrderSummaryFieldConfig['id'],
  label: string,
  visible: boolean,
  order: number,
): WorkOrderSummaryFieldConfig {
  return {
    id,
    label,
    source: id === 'item' ? 'composite' : 'rg',
    visible,
    filterable: false,
    editable: false,
    order,
  }
}

function item(overrides: Partial<WorkOrderItemSummaryRow>): WorkOrderItemSummaryRow {
  return {
    id: 'item-1',
    workOrderId: 'work-order-1',
    itemCode: 'GLASS-01',
    quantity: '1.000',
    originalDescription: 'Original glass description',
    lineTotalExcludingGst: '1200.00',
    generatedLabel: 'Generated label',
    manualLabelOverride: null,
    isActive: true,
    installerId: null,
    installerName: null,
    stageOptionId: 'stage-1',
    stageName: 'Measure',
    hardwareStatusOptionId: null,
    hardwareStatusName: null,
    maintenanceProgram: false,
    installDate: null,
    dateCompleted: null,
    riskLevel: null,
    importance: null,
    ...overrides,
  }
}

function exportRow(workOrderItem: WorkOrderItemSummaryRow | null): WorkOrderExportRow {
  return {
    id: 'work-order-1',
    servicem8Status: 'Work Order',
    isCurrent: true,
    jobNumber: 'R260199',
    jobAddress: '19 Glass Lane, Auckland',
    jobDescription: 'Replace glazing',
    clientName: 'Aroha Glass',
    companyName: 'Royal Homes',
    leadScore: 88,
    installerName: null,
    stageName: null,
    hardwareStatusName: null,
    maintenanceProgram: false,
    installDate: null,
    dateCompleted: null,
    riskLevel: null,
    importance: null,
    aiSuggestion: null,
    aiSuggestionAt: null,
    clientContextSummary: null,
    clientApproachNote: null,
    updatedAt: new Date('2026-07-15T00:00:00.000Z'),
    item: workOrderItem,
  }
}

describe('buildWorkOrderExportTable', () => {
  it('emits one row per item with required parent context and configured item values', () => {
    const fields = [
      field('jobNumber', 'Job Number', false, 1),
      field('client', 'Client', false, 2),
      field('jobAddress', 'Address', false, 3),
      field('leadScore', 'Lead Score', false, 4),
      field('item', 'Item', false, 5),
      field('importance', 'Importance', true, 6),
      field('risk', 'Risk', true, 7),
      field('installer', 'Installer', true, 8),
      field('stage', 'Stage', true, 9),
      field('hardware', 'Hardware', true, 10),
      field('maintenanceProgram', 'Maintenance Program', true, 11),
      field('installDate', 'Install Date', true, 12),
      field('dateCompleted', 'Date Completed', true, 13),
    ]

    const table = buildWorkOrderExportTable([
      exportRow(item({
        id: 'item-1',
        generatedLabel: 'Generated shower label',
        importance: 'high',
        riskLevel: 'medium',
        installerName: 'Wiremu',
        stageName: 'Measure',
        hardwareStatusName: 'Ordered',
        maintenanceProgram: true,
        installDate: '2026-07-20',
        dateCompleted: '2026-07-21',
      })),
      exportRow(item({
        id: 'item-2',
        itemCode: 'GLASS-02',
        generatedLabel: 'Generated balustrade label',
        manualLabelOverride: 'Manual balustrade label',
        stageName: 'Production',
      })),
    ], fields)

    expect(table).toEqual([
      ['Job Number', 'Client', 'Address', 'Lead Score', 'Item', 'Importance', 'Risk', 'Installer', 'Stage', 'Hardware', 'Maintenance Program', 'Install Date', 'Date Completed'],
      ['R260199', 'Aroha Glass (Royal Homes)', '19 Glass Lane, Auckland', 88, 'Generated shower label', 'high', 'medium', 'Wiremu', 'Measure', 'Ordered', 'Yes', '2026-07-20', '2026-07-21'],
      ['R260199', 'Aroha Glass (Royal Homes)', '19 Glass Lane, Auckland', 88, 'Manual balustrade label', null, null, null, 'Production', null, 'No', null, null],
    ])
  })

  it('emits one parent row with blank item fields for a zero-item Work Order', () => {
    const table = buildWorkOrderExportTable([exportRow(null)], [
      field('jobNumber', 'Job Number', true, 1),
      field('client', 'Client', true, 2),
      field('jobAddress', 'Address', true, 3),
      field('leadScore', 'Lead Score', true, 4),
      field('item', 'Item', true, 5),
      field('maintenanceProgram', 'Maintenance Program', true, 6),
      field('installDate', 'Install Date', true, 7),
    ])

    expect(table).toEqual([
      ['Job Number', 'Client', 'Address', 'Lead Score', 'Item', 'Maintenance Program', 'Install Date'],
      ['R260199', 'Aroha Glass (Royal Homes)', '19 Glass Lane, Auckland', 88, null, null, null],
    ])
  })
})
