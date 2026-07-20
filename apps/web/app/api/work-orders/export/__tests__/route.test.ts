// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireModuleMock = vi.hoisted(() => vi.fn())
const listWorkOrdersForExportMock = vi.hoisted(() => vi.fn())
const getWorkOrderSummaryConfigMock = vi.hoisted(() => vi.fn())
const getWorkOrderSpecificationFilterConfigMock = vi.hoisted(() => vi.fn())
const loadProductionSpecificationCatalogueMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/guard', () => ({ requireModule: requireModuleMock }))
vi.mock('@/modules/work-orders/queries', () => ({
  listWorkOrdersForExport: listWorkOrdersForExportMock,
}))
vi.mock('@/modules/work-orders/summary-config', () => ({
  getWorkOrderSummaryConfig: getWorkOrderSummaryConfigMock,
}))
vi.mock('@/modules/work-orders/specification-filter-config', () => ({
  getWorkOrderSpecificationFilterConfig: getWorkOrderSpecificationFilterConfigMock,
}))
vi.mock('@/modules/work-orders/production-specification-catalogue', () => ({
  loadProductionSpecificationCatalogue: loadProductionSpecificationCatalogueMock,
}))

import { GET } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  getWorkOrderSummaryConfigMock.mockResolvedValue([
    summaryField('jobNumber', 'Job Number', false, 1),
    summaryField('client', 'Client', false, 2),
    summaryField('jobAddress', 'Address', false, 3),
    summaryField('leadScore', 'Lead Score', false, 4),
    summaryField('item', 'Item', false, 5),
    summaryField('stage', 'Stage', true, 6),
  ])
  getWorkOrderSpecificationFilterConfigMock.mockResolvedValue([
    { field: 'hardwareFinish', enabled: true, order: 1 },
    { field: 'glassConstruction', enabled: false, order: 2 },
  ])
  loadProductionSpecificationCatalogueMock.mockResolvedValue([
    { id: 'hardware_finish.matte-black', field: 'hardwareFinish', displayLabel: 'Matte Black', productionLabel: 'Matt Black' },
  ])
  listWorkOrdersForExportMock.mockResolvedValue([
    exportRow('item-1', 'Generated shower label', 'Measure'),
    exportRow('item-2', 'Manual balustrade label', 'Production'),
  ])
})

describe('GET /api/work-orders/export', () => {
  it('exports each filtered item with repeated parent context', async () => {
    const response = await GET(new Request(
      'http://localhost/api/work-orders/export?q=glass&showRemovedItems=1&sort=stage_desc&spec_hardwareFinish=hardware_finish.matte-black&spec_glassConstruction=glass_construction.laminated',
    ))

    expect(requireModuleMock).toHaveBeenCalledWith('work-orders')
    expect(listWorkOrdersForExportMock).toHaveBeenCalledWith(expect.objectContaining({
      q: 'glass',
      showRemovedItems: true,
      sort: 'stage_desc',
      specification: { hardwareFinish: 'hardware_finish.matte-black' },
    }), expect.arrayContaining([
      expect.objectContaining({ id: 'hardware_finish.matte-black' }),
    ]))
    const body = await response.text()
    expect(body).toContain('"Specification Review Status"')
    expect(body).toContain('"Confirmed Hardware/Fittings Finish"')
    expect(body).toContain('"Not Started"')
    expect(body).not.toContain('glass_construction.laminated')
  })

  it('returns a bounded-export error instead of materializing an oversized download', async () => {
    listWorkOrdersForExportMock.mockRejectedValueOnce(new Error(
      'Work Order export exceeds the 10000-row limit. Narrow the filters and try again.',
    ))

    const response = await GET(new Request('http://localhost/api/work-orders/export'))

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      error: 'Work Order export exceeds the 10000-row limit. Narrow the filters and try again.',
    })
  })
})

function summaryField(id: string, label: string, visible: boolean, order: number) {
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

function exportRow(itemId: string, itemLabel: string, stageName: string) {
  return {
    id: 'work-order-1',
    servicem8Status: 'Work Order',
    isCurrent: true,
    jobNumber: 'R260199',
    jobAddress: '19 Glass Lane',
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
    item: {
      id: itemId,
      workOrderId: 'work-order-1',
      itemCode: 'GLASS-01',
      quantity: '1.000',
      originalDescription: 'Original description',
      lineTotalExcludingGst: '1200.00',
      generatedLabel: itemLabel,
      manualLabelOverride: null,
      isActive: true,
      installerId: null,
      installerName: null,
      stageOptionId: 'stage-1',
      stageName,
      hardwareStatusOptionId: null,
      hardwareStatusName: null,
      maintenanceProgram: false,
      installDate: null,
      dateCompleted: null,
      riskLevel: null,
      importance: null,
    },
  }
}
