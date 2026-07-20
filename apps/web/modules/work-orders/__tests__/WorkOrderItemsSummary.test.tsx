import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUpdateOperationalField = vi.hoisted(() => vi.fn())
const mockUpdateLabel = vi.hoisted(() => vi.fn())
const mockSaveSpecificationDraft = vi.hoisted(() => vi.fn())
const mockConfirmSpecification = vi.hoisted(() => vi.fn())
const mockRetryEnrichment = vi.hoisted(() => vi.fn())
const mockIgnoreSourceChange = vi.hoisted(() => vi.fn())
const mockCreateSourceChangeDraft = vi.hoisted(() => vi.fn())

vi.mock('../actions', () => ({
  updateWorkOrderItemLabelAction: mockUpdateLabel,
  regenerateWorkOrderItemLabelAction: vi.fn(),
  updateWorkOrderItemOperationalFieldAction: mockUpdateOperationalField,
}))
vi.mock('../production-specification-actions', () => ({
  saveWorkOrderItemProductionSpecificationDraftAction: mockSaveSpecificationDraft,
  confirmWorkOrderItemProductionSpecificationAction: mockConfirmSpecification,
  retryWorkOrderItemProductionSpecificationEnrichmentAction: mockRetryEnrichment,
  ignoreWorkOrderItemProductionSpecificationSourceChangeAction: mockIgnoreSourceChange,
  createWorkOrderItemProductionSpecificationDraftFromSourceChangeAction: mockCreateSourceChangeDraft,
}))

import { WorkOrderItemsSummary } from '../WorkOrderItemsSummary'
import { INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE } from '../production-specifications'
import type { WorkOrderItemSummaryRow } from '../work-order-items'
import type { WorkOrderSummaryFieldConfig } from '../summary-config'

function workOrderItem(
  item: Partial<WorkOrderItemSummaryRow> & Pick<WorkOrderItemSummaryRow, 'id' | 'itemCode' | 'quantity' | 'originalDescription' | 'lineTotalExcludingGst' | 'generatedLabel' | 'manualLabelOverride' | 'isActive'>,
): WorkOrderItemSummaryRow {
  return {
    workOrderId: 'work-order-1',
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
    ...item,
  }
}

function summaryField(
  id: WorkOrderSummaryFieldConfig['id'],
  overrides: Partial<WorkOrderSummaryFieldConfig> = {},
): WorkOrderSummaryFieldConfig {
  return {
    id,
    label: id === 'item' ? 'Item' : id === 'stage' ? 'Stage' : 'Risk',
    source: id === 'item' || id === 'stage' || id === 'risk' ? 'rg' : 'context',
    visible: true,
    filterable: false,
    editable: true,
    order: 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WorkOrderItemsSummary', () => {
  it('lets a Manage user retry a safely failed enrichment job', async () => {
    mockRetryEnrichment.mockResolvedValue({ status: 'queued' })
    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-enrichment-failed',
      itemCode: 'GLASS-FAIL',
      quantity: '1.000',
      originalDescription: 'Original ServiceM8 shower description remains visible',
      lineTotalExcludingGst: '900.00',
      generatedLabel: null,
      manualLabelOverride: null,
      isActive: true,
      productionSpecification: null,
      enrichmentStatus: {
        status: 'failed',
        lastSafeError: 'Enrichment failed. Retry is available.',
      },
    })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Enrichment failed - Retry' }))

    await waitFor(() => expect(mockRetryEnrichment).toHaveBeenCalledWith('item-enrichment-failed'))
    expect(await screen.findByText('Enrichment queued')).toBeInTheDocument()
    expect(screen.getByText('Original ServiceM8 shower description remains visible')).toBeInTheDocument()
  })

  it('announces a safe failure without exposing retry controls to a viewer', () => {
    render(<WorkOrderItemsSummary items={[workOrderItem({
      id: 'item-enrichment-failed-viewer',
      itemCode: 'GLASS-VIEW',
      quantity: '1.000',
      originalDescription: 'Original ServiceM8 description remains visible',
      lineTotalExcludingGst: '900.00',
      generatedLabel: null,
      manualLabelOverride: null,
      isActive: true,
      productionSpecification: null,
      enrichmentStatus: {
        status: 'failed',
        lastSafeError: 'Enrichment failed. Retry is available.',
      },
    })]} />)

    const safeFailure = screen.getByText('Enrichment failed')
    expect({
      announced: safeFailure.closest('[role="status"]') !== null,
      retryControl: screen.queryByRole('button', { name: 'Enrichment failed - Retry' }),
    }).toEqual({
      announced: true,
      retryControl: null,
    })
  })

  it('shows a confirmed Production Label and accessible read-only specification history to a viewer', () => {
    render(<WorkOrderItemsSummary items={[workOrderItem({
      id: 'item-production-specification',
      itemCode: 'GLASS-SPEC',
      quantity: '1.000',
      originalDescription: 'Original noisy ServiceM8 description with pricing and compliance wording',
      lineTotalExcludingGst: '1200.00',
      generatedLabel: 'Legacy short label',
      manualLabelOverride: null,
      isActive: true,
      productionSpecification: {
        id: 'specification-1',
        status: 'confirmed',
        draftData: null,
        confirmedData: confirmedSpecificationDocument(),
        productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Chrome | Supply & Install',
        sourceDescription: 'Original noisy ServiceM8 description with pricing and compliance wording',
        confirmedAt: new Date('2026-07-16T03:30:00.000Z'),
        history: [{
          id: 'revision-1',
          revisionType: 'baseline_confirmed',
          actorUsername: 'installer@example.com',
          previousSnapshot: null,
          newSnapshot: confirmedSpecificationDocument(),
          reasonCode: null,
          note: null,
          createdAt: new Date('2026-07-16T03:30:00.000Z'),
        }, {
          id: 'revision-2',
          revisionType: 'draft_confirmed',
          actorUsername: 'manager@example.com',
          previousSnapshot: confirmedSpecificationDocument(),
          newSnapshot: {
            ...confirmedSpecificationDocument(),
            hardwareFinish: { state: 'selected', catalogueId: 'finish.matte-black' },
          },
          reasonCode: 'client_request',
          note: 'Client approved Matte Black.',
          changes: [{
            identity: 'hardwareFinish',
            kind: 'field',
            previousValue: { state: 'selected', catalogueId: 'finish.chrome' },
            newValue: { state: 'selected', catalogueId: 'finish.matte-black' },
          }],
          createdAt: new Date('2026-07-17T03:30:00.000Z'),
        }, {
          id: 'revision-3',
          revisionType: 'catalogue_option_changed',
          actorUsername: 'configure@example.com',
          previousSnapshot: confirmedSpecificationDocument(),
          newSnapshot: confirmedSpecificationDocument(),
          reasonCode: null,
          note: 'Catalogue option finish.chrome changed: Production Label wording Chrome -> Polished Chrome.',
          changes: [{
            identity: 'finish.chrome',
            kind: 'catalogue',
            label: 'Production Label wording',
            previousValue: 'Chrome',
            newValue: 'Polished Chrome',
          }],
          createdAt: new Date('2026-07-18T03:30:00.000Z'),
        }],
      },
    })]} />)

    expect(screen.getByText('Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Chrome | Supply & Install')).toHaveClass('line-clamp-2')
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    const disclosure = screen.getByText('View specification')
    expect(disclosure.closest('details')).toBeInTheDocument()
    fireEvent.click(disclosure)
    expect(screen.getByText('Original noisy ServiceM8 description with pricing and compliance wording')).toBeInTheDocument()
    expect(screen.getByText(/Pool gate hardware/)).toBeInTheDocument()
    expect(screen.getByText('Custom design to avoid toe hold')).toBeInTheDocument()
    expect(screen.getByText(/Baseline confirmed by installer@example.com/)).toBeInTheDocument()
    expect(screen.getByText(/Client request/)).toBeInTheDocument()
    expect(screen.getByText('Hardware\/Fittings Finish: Chrome → Matte Black')).toBeInTheDocument()
    expect(screen.getByText(/Catalogue option updated by configure@example.com/)).toBeInTheDocument()
    expect(screen.getByText('Catalogue option finish.chrome — Production Label wording: Chrome → Polished Chrome')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm specification' })).not.toBeInTheDocument()
  })

  it('shows every viewer a safe ServiceM8 source comparison and only Manage users the decisions', async () => {
    mockIgnoreSourceChange.mockResolvedValue({ status: 'ignored', sourceDescriptionFingerprint: 'source-new' })
    const item = workOrderItem({
      id: 'item-source-comparison',
      itemCode: 'GLASS-SOURCE',
      quantity: '1.000',
      originalDescription: 'New ServiceM8 description with Matte Black hardware',
      lineTotalExcludingGst: '1200.00',
      generatedLabel: 'Legacy short label',
      manualLabelOverride: null,
      isActive: true,
      productionSpecification: {
        id: 'specification-source-comparison',
        status: 'confirmed',
        draftData: null,
        confirmedData: confirmedSpecificationDocument(),
        productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Chrome | Supply & Install',
        confirmedAt: new Date('2026-07-16T03:30:00.000Z'),
        confirmedRevision: 1,
        draftRevision: 1,
        sourceDescription: 'Original ServiceM8 description with Chrome hardware',
        sourceDescriptionFingerprint: 'source-old',
        currentSourceDescriptionFingerprint: 'source-new',
        sourceChanged: true,
        history: [],
      },
    })
    const { rerender } = render(<WorkOrderItemsSummary items={[item]} />)

    expect(screen.getByText('Source Changed')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Compare ServiceM8 source'))
    expect(screen.getAllByText('Original ServiceM8 description with Chrome hardware')).toHaveLength(2)
    expect(screen.getByText('New ServiceM8 description with Matte Black hardware')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ignore source change' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create new draft' })).not.toBeInTheDocument()

    rerender(<WorkOrderItemsSummary canManage items={[item]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignore source change' }))
    await waitFor(() => expect(mockIgnoreSourceChange).toHaveBeenCalledWith('item-source-comparison', {
      expectedConfirmedRevision: 1,
      sourceDescriptionFingerprint: 'source-new',
    }))
  })

  it('keeps an authorised manual label correction editable after enrichment', () => {
    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-enriched-label-correction',
      itemCode: 'GLASS-CORRECTED',
      quantity: '1.000',
      originalDescription: 'Original ServiceM8 description',
      lineTotalExcludingGst: '1200.00',
      generatedLabel: 'Generated rail label',
      manualLabelOverride: 'Staff corrected rail label',
      isActive: true,
      productionSpecification: {
        id: 'specification-corrected-label',
        status: 'confirmed',
        draftData: null,
        confirmedData: confirmedSpecificationDocument(),
        productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear',
        confirmedAt: new Date('2026-07-16T03:30:00.000Z'),
        history: [],
      },
    })]} />)

    expect(screen.getByRole('textbox', { name: 'Short label for GLASS-CORRECTED' }))
      .toHaveValue('Staff corrected rail label')
  })

  it('falls back to the existing short label when Production Specifications are disabled', () => {
    render(<WorkOrderItemsSummary productionSpecificationsEnabled={false} items={[workOrderItem({
      id: 'item-disabled-specification',
      itemCode: 'GLASS-FALLBACK',
      quantity: '1.000',
      originalDescription: 'Original ServiceM8 description',
      lineTotalExcludingGst: '1200.00',
      generatedLabel: 'Existing short label',
      manualLabelOverride: null,
      isActive: true,
      productionSpecification: {
        id: 'specification-1',
        status: 'confirmed',
        draftData: null,
        confirmedData: confirmedSpecificationDocument(),
        productionLabel: 'Production label hidden by flag',
        confirmedAt: new Date('2026-07-16T03:30:00.000Z'),
        history: [],
      },
    })]} />)

    expect(screen.getByText('Existing short label')).toBeInTheDocument()
    expect(screen.queryByText('Production label hidden by flag')).not.toBeInTheDocument()
    expect(screen.queryByText('View specification')).not.toBeInTheDocument()
  })

  it('lets a Manage user reopen a confirmed specification for a later client change', async () => {
    const confirmed = confirmedSpecificationDocument()
    mockSaveSpecificationDraft.mockResolvedValue({
      id: 'specification-1',
      status: 'confirmed',
      draftData: confirmed,
      confirmedRevision: 1,
      draftRevision: 2,
    })
    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-client-change',
      itemCode: 'GLASS-CHANGE',
      quantity: '1.000',
      originalDescription: 'Original ServiceM8 description',
      lineTotalExcludingGst: '1200.00',
      generatedLabel: 'Existing short label',
      manualLabelOverride: null,
      isActive: true,
      productionSpecification: {
        id: 'specification-1',
        status: 'confirmed',
        draftData: null,
        confirmedData: confirmed,
        productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Chrome | Supply & Install',
        confirmedAt: new Date('2026-07-16T03:30:00.000Z'),
        confirmedRevision: 1,
        draftRevision: 1,
        history: [],
      },
    })]} />)

    fireEvent.click(screen.getByText('View specification'))
    fireEvent.click(screen.getByRole('button', { name: 'Change specification' }))

    await waitFor(() => expect(mockSaveSpecificationDraft).toHaveBeenCalledWith('item-client-change', confirmed, {
      expectedConfirmedRevision: 1,
      expectedDraftRevision: 1,
    }))
    expect(await screen.findByText('Review and correct draft')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm specification' })).toBeInTheDocument()
  })

  it('completes the Chrome to Matte Black client-request journey with required reason and revision tokens', async () => {
    const confirmed = confirmedSpecificationDocument()
    mockSaveSpecificationDraft.mockResolvedValue({
      id: 'specification-1',
      status: 'confirmed',
      confirmedRevision: 1,
      draftRevision: 3,
    })
    mockConfirmSpecification.mockResolvedValue({
      status: 'confirmed',
      productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Matte Black | Supply & Install',
      confirmedRevision: 2,
    })
    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-client-revision',
      itemCode: 'GLASS-REVISION',
      quantity: '1.000',
      originalDescription: 'ServiceM8 source with Chrome hardware',
      lineTotalExcludingGst: '1200.00',
      generatedLabel: 'Existing short label',
      manualLabelOverride: null,
      isActive: true,
      productionSpecification: {
        id: 'specification-1',
        status: 'confirmed',
        draftData: confirmed,
        confirmedData: confirmed,
        productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Chrome | Supply & Install',
        confirmedAt: new Date('2026-07-16T03:30:00.000Z'),
        confirmedRevision: 1,
        draftRevision: 2,
        history: [],
      },
    })]} />)

    fireEvent.click(screen.getByText('View specification'))
    fireEvent.change(screen.getByLabelText('Hardware/Fittings Finish for GLASS-REVISION'), {
      target: { value: 'finish.matte-black' },
    })
    fireEvent.change(screen.getByLabelText('Change reason'), { target: { value: 'client_request' } })
    fireEvent.change(screen.getByLabelText('Change note (optional)'), {
      target: { value: 'Client approved Matte Black.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm specification' }))

    await waitFor(() => expect(mockSaveSpecificationDraft).toHaveBeenCalledWith(
      'item-client-revision',
      expect.objectContaining({
        hardwareFinish: { state: 'selected', catalogueId: 'finish.matte-black' },
      }),
      { expectedConfirmedRevision: 1, expectedDraftRevision: 2 },
    ))
    await waitFor(() => expect(mockConfirmSpecification).toHaveBeenCalledWith('item-client-revision', {
      expectedConfirmedRevision: 1,
      expectedDraftRevision: 3,
      changeReason: {
        code: 'client_request',
        note: 'Client approved Matte Black.',
      },
    }))
  })

  it('lets a Manage user correct a Needs Review draft and confirm it without entering a change reason', async () => {
    mockSaveSpecificationDraft.mockResolvedValue({
      id: 'specification-1',
      status: 'needs_review',
      confirmedRevision: 0,
      draftRevision: 1,
    })
    mockConfirmSpecification.mockResolvedValue({ status: 'confirmed', productionLabel: 'Updated production label' })
    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-draft',
      itemCode: 'GLASS-DRAFT',
      quantity: '1.000',
      originalDescription: 'Original ServiceM8 description',
      lineTotalExcludingGst: '1200.00',
      generatedLabel: 'Legacy short label',
      manualLabelOverride: null,
      isActive: true,
      productionSpecification: {
        id: 'specification-1',
        status: 'needs_review',
        draftData: {
          ...confirmedSpecificationDocument(),
          measurements: [],
          additionalComponents: [],
          specialRequirements: [],
        },
        confirmedData: null,
        productionLabel: null,
        confirmedAt: null,
        history: [],
      },
    })]} />)

    fireEvent.click(screen.getByText('View specification'))
    fireEvent.change(screen.getByLabelText('Hardware/Fittings Finish for GLASS-DRAFT'), {
      target: { value: 'finish.matte-black' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(mockSaveSpecificationDraft).toHaveBeenCalledWith(
      'item-draft',
      expect.objectContaining({
        hardwareFinish: { state: 'selected', catalogueId: 'finish.matte-black' },
      }),
      { expectedConfirmedRevision: 0, expectedDraftRevision: 0 },
    ))
    expect(screen.getByText('Draft saved')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm specification' }))
    await waitFor(() => expect(mockConfirmSpecification).toHaveBeenCalledWith('item-draft', {
      expectedConfirmedRevision: 0,
      expectedDraftRevision: 1,
    }))
    expect(screen.queryByLabelText(/Change reason/)).not.toBeInTheDocument()
  })

  it('reviews a worker draft using an active database-only catalogue option', () => {
    const catalogue = [
      ...INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
      {
        id: 'system.custom-rail',
        field: 'system' as const,
        displayLabel: 'Custom Rail',
        productionLabel: 'Custom Rail',
        aliases: ['custom rail'],
        isActive: true,
      },
    ]
    render(<WorkOrderItemsSummary
      canManage
      catalogue={catalogue}
      items={[workOrderItem({
        id: 'item-database-catalogue',
        itemCode: 'RAIL-CUSTOM',
        quantity: '1.000',
        originalDescription: 'Custom rail at balcony',
        lineTotalExcludingGst: '1200.00',
        generatedLabel: 'Custom Rail | Ext Balcony',
        manualLabelOverride: null,
        isActive: true,
        productionSpecification: {
          id: 'specification-database-catalogue',
          status: 'needs_review',
          draftData: {
            ...confirmedSpecificationDocument(),
            system: { state: 'selected', catalogueId: 'system.custom-rail' },
          },
          confirmedData: null,
          productionLabel: null,
          confirmedAt: null,
          history: [],
        },
      })]}
    />)

    fireEvent.click(screen.getByText('View specification'))

    expect(screen.getByLabelText('System for RAIL-CUSTOM')).toHaveValue('system.custom-rail')
    expect(screen.getByRole('option', { name: 'Custom Rail' })).toBeInTheDocument()
  })

  it('keeps a confirmed specification readable after its catalogue option is deprecated', () => {
    const catalogue = [
      ...INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
      {
        id: 'system.retired-rail',
        field: 'system' as const,
        displayLabel: 'Retired Rail',
        productionLabel: 'Retired Rail',
        aliases: [],
        isActive: false,
      },
    ]
    render(<WorkOrderItemsSummary
      catalogue={catalogue}
      items={[workOrderItem({
        id: 'item-retired-catalogue',
        itemCode: 'RAIL-RETIRED',
        quantity: '1.000',
        originalDescription: 'Historical retired rail specification',
        lineTotalExcludingGst: '1200.00',
        generatedLabel: 'Legacy rail label',
        manualLabelOverride: null,
        isActive: true,
        productionSpecification: {
          id: 'specification-retired-catalogue',
          status: 'confirmed',
          draftData: null,
          confirmedData: {
            ...confirmedSpecificationDocument(),
            system: { state: 'selected', catalogueId: 'system.retired-rail' },
          },
          productionLabel: 'Retired Rail | Ext Balcony',
          confirmedAt: new Date('2026-07-16T00:00:00.000Z'),
          history: [],
        },
      })]}
    />)

    fireEvent.click(screen.getByText('View specification'))

    expect(screen.getByText('Retired Rail')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Retired Rail' })).not.toBeInTheDocument()
  })

  it('lets a Manage user add structured measurements, components, and special requirements to a draft', async () => {
    mockSaveSpecificationDraft.mockResolvedValue({
      id: 'specification-1',
      status: 'needs_review',
      confirmedRevision: 0,
      draftRevision: 1,
    })
    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-repeatable-details',
      itemCode: 'GLASS-DETAILS',
      quantity: '1.000',
      originalDescription: 'Original ServiceM8 description',
      lineTotalExcludingGst: '1200.00',
      generatedLabel: 'Legacy short label',
      manualLabelOverride: null,
      isActive: true,
      productionSpecification: {
        id: 'specification-1',
        status: 'needs_review',
        draftData: {
          ...confirmedSpecificationDocument(),
          measurements: [],
          additionalComponents: [],
          specialRequirements: [],
        },
        confirmedData: null,
        productionLabel: null,
        confirmedAt: null,
        history: [],
      },
    })]} />)

    fireEvent.click(screen.getByText('View specification'))
    fireEvent.click(screen.getByRole('button', { name: 'Add measurement' }))
    fireEvent.change(screen.getByLabelText('Measurement value 1'), { target: { value: '14900' } })
    fireEvent.change(screen.getByLabelText('Measurement unit 1'), { target: { value: 'mm' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add component' }))
    fireEvent.change(screen.getByLabelText('Component name 1'), { target: { value: 'Pool gate hardware' } })
    fireEvent.change(screen.getByLabelText('Component quantity 1'), { target: { value: '1 set' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add special requirement' }))
    fireEvent.change(screen.getByLabelText('Special requirement detail 1'), {
      target: { value: 'Custom design to avoid toe hold' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(mockSaveSpecificationDraft).toHaveBeenCalledWith(
      'item-repeatable-details',
      expect.objectContaining({
        measurements: [expect.objectContaining({ kind: 'other', value: '14900', unit: 'mm' })],
        additionalComponents: [expect.objectContaining({ name: 'Pool gate hardware', quantity: '1 set' })],
        specialRequirements: [expect.objectContaining({
          kind: 'other',
          detail: 'Custom design to avoid toe hold',
        })],
      }),
      { expectedConfirmedRevision: 0, expectedDraftRevision: 0 },
    ))
  })

  it('lets a Manage user create the first TBC draft when an item has not been enriched', async () => {
    const emptyDraft = {
      ...confirmedSpecificationDocument(),
      system: { state: 'tbc' },
      structureMaterial: { state: 'tbc' },
      structureType: { state: 'tbc' },
      locationEnvironment: { state: 'tbc' },
      structureBuilt: { state: 'tbc' },
      glassConstruction: { state: 'tbc' },
      glassAppearance: { state: 'tbc' },
      thickness: { state: 'tbc' },
      gateRequired: { state: 'tbc' },
      fixingMethod: { state: 'tbc' },
      hardwareFinish: { state: 'tbc' },
      deliveryScope: { state: 'tbc' },
      additionalComponents: [],
      specialRequirements: [],
    }
    mockSaveSpecificationDraft.mockResolvedValue({
      id: 'specification-new',
      status: 'needs_review',
      draftData: emptyDraft,
      confirmedRevision: 0,
      draftRevision: 1,
    })
    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-without-specification',
      itemCode: 'GLASS-NEW',
      quantity: '1.000',
      originalDescription: 'Noisy ServiceM8 description',
      lineTotalExcludingGst: '900.00',
      generatedLabel: 'Legacy short label',
      manualLabelOverride: null,
      isActive: true,
      productionSpecification: null,
    })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Create specification draft' }))

    await waitFor(() => expect(mockSaveSpecificationDraft).toHaveBeenCalledWith(
      'item-without-specification',
      expect.objectContaining({
        schemaVersion: 1,
        system: { state: 'tbc' },
        locationEnvironment: { state: 'tbc' },
        additionalComponents: [],
        specialRequirements: [],
      }),
      { expectedConfirmedRevision: 0, expectedDraftRevision: 0 },
    ))
    expect(await screen.findByText('Needs Review')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Short label for GLASS-NEW' }))
      .toHaveValue('Legacy short label')
  })

  it('renders configured item fields in order and hides the composite Item cell as one field', () => {
    render(<WorkOrderItemsSummary
      fields={[
        summaryField('stage', { order: 1 }),
        summaryField('item', { visible: false, order: 2 }),
        summaryField('risk', { order: 3 }),
      ]}
      items={[workOrderItem({
        id: 'item-configured',
        itemCode: 'GLASS-HIDDEN',
        quantity: '3.000',
        originalDescription: 'Hidden composite description',
        lineTotalExcludingGst: '900.00',
        generatedLabel: 'Hidden composite label',
        manualLabelOverride: null,
        isActive: true,
        stageName: 'Ready to install',
        riskLevel: 'high',
      })]}
    />)

    const stage = screen.getByText('Stage')
    const risk = screen.getByText('Risk')
    expect(stage.compareDocumentPosition(risk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText('GLASS-HIDDEN')).not.toBeInTheDocument()
    expect(screen.queryByText('Qty 3')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden composite label')).not.toBeInTheDocument()
  })

  it('renders edit controls only when Manage permission and Editable configuration both allow them', () => {
    render(<WorkOrderItemsSummary
      canManage
      fields={[
        summaryField('item', { editable: false, order: 1 }),
        summaryField('risk', { editable: false, order: 2 }),
        summaryField('importance', { editable: true, order: 3, label: 'Importance' }),
      ]}
      items={[workOrderItem({
        id: 'item-edit-policy',
        itemCode: 'GLASS-POLICY',
        quantity: '1.000',
        originalDescription: 'Policy test glass',
        lineTotalExcludingGst: '900.00',
        generatedLabel: 'Configured label',
        manualLabelOverride: null,
        isActive: true,
        riskLevel: 'high',
        importance: 'medium',
      })]}
    />)

    expect(screen.queryByRole('textbox', { name: 'Short label for GLASS-POLICY' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Risk for GLASS-POLICY' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Importance for GLASS-POLICY' })).toBeInTheDocument()
  })


  it('shows every active ServiceM8 item beneath one parent count', () => {
    render(<WorkOrderItemsSummary items={[
      workOrderItem({
        id: 'item-1',
        itemCode: 'GLASS-001',
        quantity: '1.000',
        originalDescription: 'Shower glass',
        lineTotalExcludingGst: '900.00',
        generatedLabel: null,
        manualLabelOverride: null,
        isActive: true,
      }),
      workOrderItem({
        id: 'item-2',
        itemCode: 'HARDWARE-001',
        quantity: '2.000',
        originalDescription: 'Shower hardware',
        lineTotalExcludingGst: '150.00',
        generatedLabel: null,
        manualLabelOverride: null,
        isActive: true,
      }),
    ]} />)

    expect(screen.getByText('2 active items')).toBeInTheDocument()
    expect(screen.getByText('GLASS-001')).toHaveClass('bg-[#142B3A]', 'text-sm', 'font-semibold', 'text-white')
    expect(screen.getByText('Shower glass')).toBeInTheDocument()
    expect(screen.getByText('HARDWARE-001')).toBeInTheDocument()
    expect(screen.getByText('Shower hardware')).toBeInTheDocument()
  })

  it('uses one job-level colour across all active item cards', () => {
    render(<WorkOrderItemsSummary tone="tint" items={[
      workOrderItem({ id: 'item-1', itemCode: 'GLASS-001', quantity: '1.000', originalDescription: 'Shower glass', lineTotalExcludingGst: '900.00', generatedLabel: null, manualLabelOverride: null, isActive: true }),
      workOrderItem({ id: 'item-2', itemCode: 'HARDWARE-001', quantity: '1.000', originalDescription: 'Shower hardware', lineTotalExcludingGst: '150.00', generatedLabel: null, manualLabelOverride: null, isActive: true }),
    ]} />)

    const rows = screen.getAllByRole('row')
    expect(rows[0]).toHaveClass('bg-[#E8EEF1]')
    expect(rows[1]).toHaveClass('bg-[#E8EEF1]')
  })

  it('keeps an empty Work Order visible without inventing a child item', () => {
    render(<WorkOrderItemsSummary items={[]} />)

    expect(screen.getByText('0 active items')).toBeInTheDocument()
    expect(screen.getByText('No items synced from ServiceM8 yet')).toBeInTheDocument()
  })

  it('marks removed rows while keeping the active count unchanged', () => {
    render(<WorkOrderItemsSummary items={[
      workOrderItem({ id: 'item-active', itemCode: 'GLASS-001', quantity: '1.000', originalDescription: 'Current glass', lineTotalExcludingGst: '900.00', generatedLabel: null, manualLabelOverride: null, isActive: true }),
      workOrderItem({ id: 'item-removed', itemCode: 'OLD-001', quantity: '1.000', originalDescription: 'Removed glass', lineTotalExcludingGst: '800.00', generatedLabel: null, manualLabelOverride: null, isActive: false }),
    ]} />)

    expect(screen.getByText('1 active item')).toBeInTheDocument()
    expect(screen.getByText('Removed glass')).toBeInTheDocument()
    expect(screen.getByText('Removed')).toBeInTheDocument()
  })

  it('keeps immutable source detail in the hover text when ServiceM8 has no line total', () => {
    render(<WorkOrderItemsSummary items={[
      workOrderItem({
        id: 'item-no-total',
        itemCode: 'GLASS-001',
        quantity: '1.000',
        originalDescription: 'Original ServiceM8 glass description',
        lineTotalExcludingGst: null,
        generatedLabel: 'Generated glass label',
        manualLabelOverride: 'Manual production label',
        isActive: true,
      }),
    ]} />)

    expect(screen.getByText('Manual production label').parentElement).toHaveAttribute(
      'title',
      'Original ServiceM8 glass description\nLine total excluding GST: Not available',
    )
  })

  it('shows a truncated source fallback and clear pending state after label generation fails', () => {
    const originalDescription = 'Supply and install a very long frameless shower screen description with dimensions, hardware, finish, and additional production notes'

    render(<WorkOrderItemsSummary items={[workOrderItem({
      id: 'item-pending',
      itemCode: 'GLASS-001',
      quantity: '1.000',
      originalDescription,
      lineTotalExcludingGst: '900.00',
      generatedLabel: null,
      manualLabelOverride: null,
      labelStatus: 'failed',
      isActive: true,
    })]} />)

    expect(screen.getByText(`${originalDescription.slice(0, 77)}...`)).toBeInTheDocument()
    expect(screen.getByText('Label pending')).toBeInTheDocument()
    expect(screen.queryByText(originalDescription)).not.toBeInTheDocument()
  })

  it('keeps a manual label visible when its ServiceM8 source description changed', () => {
    render(<WorkOrderItemsSummary items={[workOrderItem({
      id: 'item-source-changed',
      itemCode: 'GLASS-001',
      quantity: '1.000',
      originalDescription: 'Updated source description',
      lineTotalExcludingGst: '900.00',
      generatedLabel: 'Old generated label',
      manualLabelOverride: 'Staff-approved production label',
      labelStatus: 'source_changed',
      isActive: true,
    })]} />)

    expect(screen.getByText('Staff-approved production label')).toBeInTheDocument()
    expect(screen.getByText('Source description changed')).toBeInTheDocument()
  })

  it('lets manage users edit only the short label and confirms AI regeneration', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-editable',
      itemCode: 'GLASS-001',
      quantity: '2.000',
      originalDescription: 'Immutable ServiceM8 source description',
      lineTotalExcludingGst: '900.00',
      generatedLabel: 'Generated production label',
      manualLabelOverride: null,
      labelStatus: 'generated',
      isActive: true,
    })]} />)

    expect(screen.getByRole('textbox', { name: 'Short label for GLASS-001' })).toHaveValue('Generated production label')
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByText('Qty 2')).not.toHaveAttribute('contenteditable')
    expect(screen.getByText('GLASS-001')).not.toHaveAttribute('contenteditable')

    fireEvent.submit(screen.getByRole('button', { name: 'Regenerate with AI' }).closest('form')!)
    expect(confirm).toHaveBeenCalledWith('Regenerate this label with AI? This will replace the current label.')

    confirm.mockRestore()
  })

  it('saves a manually edited label and shows visible success feedback', async () => {
    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-save-label',
      itemCode: 'GLASS-001',
      quantity: '1.000',
      originalDescription: 'Original description',
      lineTotalExcludingGst: '900.00',
      generatedLabel: 'Original label',
      manualLabelOverride: null,
      labelStatus: 'generated',
      isActive: true,
    })]} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Short label for GLASS-001' }), {
      target: { value: 'Updated production label' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save label' }))

    await waitFor(() => expect(mockUpdateLabel).toHaveBeenCalledTimes(1))
    const submitted = mockUpdateLabel.mock.calls[0][1] as FormData
    expect(submitted.get('label')).toBe('Updated production label')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('shows the label save error and offers a retry', async () => {
    mockUpdateLabel.mockRejectedValueOnce(new Error('Label editing is unavailable.'))
    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-save-error',
      itemCode: 'GLASS-ERROR',
      quantity: '1.000',
      originalDescription: 'Original description',
      lineTotalExcludingGst: '900.00',
      generatedLabel: 'Original label',
      manualLabelOverride: null,
      labelStatus: 'generated',
      isActive: true,
    })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save label' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Label editing is unavailable.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('gives manage users independent controls for all eight item operational fields', () => {
    render(<WorkOrderItemsSummary
      canManage
      options={{
        installers: [{ id: 'installer-1', label: 'Install Team' }],
        stages: [{ id: 'stage-1', label: 'Ready to install' }],
        hardwareStatuses: [{ id: 'hardware-1', label: 'Hardware ready' }],
      }}
      items={[{
        id: 'item-operational',
        workOrderId: 'work-order-1',
        itemCode: 'GLASS-001',
        quantity: '1.000',
        originalDescription: 'Shower glass',
        lineTotalExcludingGst: '900.00',
        generatedLabel: 'Shower panel',
        manualLabelOverride: null,
        isActive: true,
        installerId: 'installer-1',
        installerName: 'Install Team',
        stageOptionId: 'stage-1',
        stageName: 'Ready to install',
        hardwareStatusOptionId: 'hardware-1',
        hardwareStatusName: 'Hardware ready',
        maintenanceProgram: true,
        installDate: '2026-07-20',
        dateCompleted: null,
        riskLevel: 'high',
        importance: 'medium',
      }]}
    />)

    for (const label of [
      'Installer for GLASS-001',
      'Stage for GLASS-001',
      'Hardware for GLASS-001',
      'Maintenance Program for GLASS-001',
      'Install date for GLASS-001',
      'Date completed for GLASS-001',
      'Risk for GLASS-001',
      'Importance for GLASS-001',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }

    const operationalCell = screen.getByRole('cell', { name: 'Work Order item controls' })
    const operationalLine = operationalCell.querySelector('dl')
    if (!operationalLine) throw new Error('The Work Order item controls list was not rendered.')
    expect(operationalLine).toHaveClass('xl:grid-cols-8')
    expect(operationalLine.querySelectorAll('select, input[type="date"]')).toHaveLength(8)
    expect(screen.queryByText('Item')).not.toBeInTheDocument()
  })

  it('shows item operational values without edit controls for view-only users', () => {
    render(<WorkOrderItemsSummary items={[workOrderItem({
      id: 'item-view-only',
      itemCode: 'GLASS-001',
      quantity: '1.000',
      originalDescription: 'Shower glass',
      lineTotalExcludingGst: '900.00',
      generatedLabel: 'Shower panel',
      manualLabelOverride: null,
      isActive: true,
      installerName: 'Install Team',
      stageName: 'Ready to install',
      hardwareStatusName: 'Hardware ready',
      maintenanceProgram: true,
      installDate: '2026-07-20',
      riskLevel: 'high',
      importance: 'medium',
    })]} />)

    for (const value of ['Install Team', 'Ready to install', 'Hardware ready', 'Yes', '2026-07-20', 'High', 'Medium']) {
      expect(screen.getByText(value)).toBeInTheDocument()
    }
    expect(screen.queryByLabelText('Installer for GLASS-001')).not.toBeInTheDocument()
  })

  it('does not offer bulk apply controls to manage users', () => {
    render(<WorkOrderItemsSummary canManage items={[workOrderItem({
      id: 'item-manage',
      itemCode: 'GLASS-001',
      quantity: '1.000',
      originalDescription: 'Shower glass',
      lineTotalExcludingGst: '900.00',
      generatedLabel: 'Shower panel',
      manualLabelOverride: null,
      isActive: true,
    })]} />)

    expect(screen.queryByText('Apply to all active items')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Apply .* to all active items/ })).not.toBeInTheDocument()
  })

  it('restores only the failed field and offers retry with actionable feedback', async () => {
    mockUpdateOperationalField
      .mockRejectedValueOnce(new Error('Installer could not be saved because the option is no longer active.'))
      .mockResolvedValueOnce({ value: 'installer-2' })

    render(<WorkOrderItemsSummary
      canManage
      options={{
        installers: [
          { id: 'installer-1', label: 'Install Team One' },
          { id: 'installer-2', label: 'Install Team Two' },
        ],
        stages: [{ id: 'stage-1', label: 'Ready to install' }],
        hardwareStatuses: [],
      }}
      items={[{
        id: 'item-save',
        workOrderId: 'work-order-1',
        itemCode: 'GLASS-001',
        quantity: '1.000',
        originalDescription: 'Shower glass',
        lineTotalExcludingGst: '900.00',
        generatedLabel: 'Shower panel',
        manualLabelOverride: null,
        isActive: true,
        installerId: 'installer-1',
        installerName: 'Install Team One',
        stageOptionId: 'stage-1',
        stageName: 'Ready to install',
        hardwareStatusOptionId: null,
        hardwareStatusName: null,
        maintenanceProgram: false,
        installDate: null,
        dateCompleted: null,
        riskLevel: null,
        importance: null,
      }]}
    />)

    const installer = screen.getByLabelText('Installer for GLASS-001')
    const stage = screen.getByLabelText('Stage for GLASS-001')
    fireEvent.change(installer, { target: { value: 'installer-2' } })

    expect(screen.getByText('Saving')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Installer could not be saved because the option is no longer active.',
    )
    expect(installer).toHaveValue('installer-1')
    expect(stage).toHaveValue('stage-1')

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
    expect(installer).toHaveValue('installer-2')
    expect(mockUpdateOperationalField).toHaveBeenCalledTimes(2)
  })
})

function confirmedSpecificationDocument() {
  return {
    schemaVersion: 1,
    system: { state: 'selected', catalogueId: 'system.double-disc' },
    structureMaterial: { state: 'selected', catalogueId: 'structure_material.timber' },
    structureType: { state: 'selected', catalogueId: 'structure_type.balcony' },
    locationEnvironment: { state: 'selected', catalogueId: 'location.external' },
    locationDetail: { state: 'tbc' },
    structureBuilt: { state: 'selected', catalogueId: 'structure_built.new' },
    glassConstruction: { state: 'selected', catalogueId: 'glass_construction.toughened' },
    glassAppearance: { state: 'selected', catalogueId: 'glass_appearance.clear' },
    thickness: { state: 'selected', catalogueId: 'thickness.12mm' },
    gateRequired: { state: 'selected', catalogueId: 'gate_required.no' },
    doorOpeningType: { state: 'tbc' },
    fixingMethod: { state: 'selected', catalogueId: 'fixing_method.double-disc' },
    hardwareFinish: { state: 'selected', catalogueId: 'finish.chrome' },
    systemFinish: { state: 'tbc' },
    interlinkingRail: { state: 'tbc' },
    deliveryScope: { state: 'selected', catalogueId: 'delivery_scope.supply-install' },
    measurements: [],
    additionalComponents: [{ name: 'Pool gate hardware', quantity: '1' }],
    specialRequirements: [{ kind: 'design_constraint', detail: 'Custom design to avoid toe hold' }],
  }
}
