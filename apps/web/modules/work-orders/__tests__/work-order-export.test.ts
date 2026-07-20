import { describe, expect, it } from 'vitest'

import { buildWorkOrderExportTable, type WorkOrderExportRow } from '../work-order-export'
import type { WorkOrderSummaryFieldConfig } from '../summary-config'
import type { WorkOrderItemSummaryRow } from '../work-order-items'
import { createEmptyProductionSpecification } from '../production-specifications'

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
  it('exports actual review status and current confirmed fields without draft or audit data', () => {
    const confirmedData = {
      ...createEmptyProductionSpecification(),
      hardwareFinish: { state: 'selected' as const, catalogueId: 'hardware_finish.matte-black' },
      specialRequirements: [{ kind: 'design_constraint' as const, detail: 'Keep 25 mm clearance' }],
    }
    const draftData = {
      ...confirmedData,
      hardwareFinish: { state: 'selected' as const, catalogueId: 'hardware_finish.brushed-brass' },
      specialRequirements: [{ kind: 'other' as const, detail: 'DRAFT SECRET' }],
    }
    const table = buildWorkOrderExportTable([
      exportRow(item({
        productionSpecification: {
          id: 'specification-1',
          status: 'needs_review',
          confirmedData,
          draftData,
          productionLabel: 'Current confirmed production label',
          confirmedAt: new Date('2026-07-16T03:30:00.000Z'),
          evidenceData: [{ source: 'RAW EVIDENCE SECRET' }],
          history: [{
            id: 'revision-1',
            revisionType: 'confirmed_change',
            actorUsername: 'staff@example.com',
            previousSnapshot: { providerMetadata: 'PROVIDER SECRET' },
            newSnapshot: confirmedData,
            reasonCode: 'design_change',
            note: 'AUDIT NOTE SECRET',
            createdAt: new Date('2026-07-17T03:30:00.000Z'),
          }],
        },
      })),
      exportRow(item({
        id: 'draft-only-item',
        productionSpecification: {
          id: 'specification-2',
          status: 'needs_review',
          confirmedData: null,
          draftData,
          productionLabel: null,
          confirmedAt: null,
          history: [],
        },
      })),
    ], [field('item', 'Item', true, 1)], [
      { id: 'hardware_finish.matte-black', field: 'hardwareFinish', displayLabel: 'Matte Black', productionLabel: 'Matt Black' },
      { id: 'hardware_finish.brushed-brass', field: 'hardwareFinish', displayLabel: 'Brushed Brass', productionLabel: 'Brass' },
    ])

    const reviewStatus = table[0].indexOf('Specification Review Status')
    const productionLabel = table[0].indexOf('Production Label')
    const hardwareFinish = table[0].indexOf('Confirmed Hardware/Fittings Finish')
    const requirements = table[0].indexOf('Confirmed Special Requirements')
    expect(table[1][reviewStatus]).toBe('Needs Review')
    expect(table[1][productionLabel]).toBe('Current confirmed production label')
    expect(table[1][hardwareFinish]).toBe('Matte Black')
    expect(table[1][requirements]).toBe('Design constraint: Keep 25 mm clearance')
    expect(table[2][reviewStatus]).toBe('Needs Review')
    expect(table[2][productionLabel]).toBeNull()
    expect(table[2][hardwareFinish]).toBeNull()
    expect(JSON.stringify(table)).not.toMatch(/DRAFT SECRET|RAW EVIDENCE SECRET|PROVIDER SECRET|AUDIT NOTE SECRET|Brushed Brass/)
    expect(JSON.stringify(table)).not.toContain('1200.00')
  })

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

    expect(table.map((row) => row.slice(0, 13))).toEqual([
      ['Job Number', 'Client', 'Address', 'Lead Score', 'Item', 'Importance', 'Risk', 'Installer', 'Stage', 'Hardware', 'Maintenance Program', 'Install Date', 'Date Completed'],
      ['R260199', 'Aroha Glass (Royal Homes)', '19 Glass Lane, Auckland', 88, 'Generated shower label', 'high', 'medium', 'Wiremu', 'Measure', 'Ordered', 'Yes', '2026-07-20', '2026-07-21'],
      ['R260199', 'Aroha Glass (Royal Homes)', '19 Glass Lane, Auckland', 88, 'Manual balustrade label', null, null, null, 'Production', null, 'No', null, null],
    ])
    const reviewStatus = table[0].indexOf('Specification Review Status')
    expect(table[1][reviewStatus]).toBe('Not Started')
    expect(table[2][reviewStatus]).toBe('Not Started')
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

    expect(table.map((row) => row.slice(0, 7))).toEqual([
      ['Job Number', 'Client', 'Address', 'Lead Score', 'Item', 'Maintenance Program', 'Install Date'],
      ['R260199', 'Aroha Glass (Royal Homes)', '19 Glass Lane, Auckland', 88, null, null, null],
    ])
    expect(table[0]).toContain('Specification Review Status')
    expect(table[1].slice(7).every((value) => value === null)).toBe(true)
  })
})
