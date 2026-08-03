// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const orderByCalls = vi.hoisted(() => [] as unknown[][])
const whereCalls = vi.hoisted(() => [] as unknown[])
const limitCalls = vi.hoisted(() => [] as unknown[])
const offsetCalls = vi.hoisted(() => [] as unknown[])
const selectResults = vi.hoisted(() => [] as unknown[])
const selectShapes = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock('drizzle-orm', () => {
  function columnName(column: { name?: string }) {
    return column?.name
  }

  return {
    and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    asc: vi.fn((column: unknown) => ({ direction: 'asc', column: columnName(column as { name?: string }) ?? column })),
    count: vi.fn(() => 'count'),
    desc: vi.fn((column: unknown) => ({ direction: 'desc', column })),
    eq: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'eq', column: columnName(column), value })),
    ilike: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'ilike', column: columnName(column), value })),
    inArray: vi.fn((column: { name?: string }, values: unknown[]) => ({ type: 'inArray', column: columnName(column), values })),
    or: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: 'sql',
      text: strings.join('?'),
      values,
    })),
  }
})

vi.mock('@rgtools/db/schema-leads', () => ({
  clientContacts: {
    id: { name: 'client_contacts.id' },
    clientId: { name: 'client_contacts.client_id' },
    name: { name: 'client_contacts.name' },
    phone: { name: 'client_contacts.phone' },
    email: { name: 'client_contacts.email' },
  },
  clients: { id: { name: 'clients.id' }, name: { name: 'clients.name' }, companyName: { name: 'clients.company_name' }, notes: { name: 'clients.notes' } },
  leads: {
    id: { name: 'leads.id' },
    clientId: { name: 'leads.client_id' },
    contactId: { name: 'leads.contact_id' },
    seedScore: { name: 'leads.seed_score' },
    servicem8JobUuid: { name: 'leads.servicem8_job_uuid' },
    servicem8JobNumber: { name: 'leads.servicem8_job_number' },
  },
}))

vi.mock('@rgtools/db/schema-workorders', () => ({
  workOrderEvents: {
    id: { name: 'work_order_events.id' },
    workOrderId: { name: 'work_order_events.work_order_id' },
    workOrderItemId: { name: 'work_order_events.work_order_item_id' },
    actorId: { name: 'work_order_events.actor_id' },
    fieldName: { name: 'work_order_events.field_name' },
    previousValue: { name: 'work_order_events.previous_value' },
    newValue: { name: 'work_order_events.new_value' },
    note: { name: 'work_order_events.note' },
    isClientVisibleCandidate: { name: 'work_order_events.is_client_visible_candidate' },
    portalTitle: { name: 'work_order_events.portal_title' },
    portalMessage: { name: 'work_order_events.portal_message' },
    createdAt: { name: 'work_order_events.created_at' },
  },
  workOrderHardwareStatusOptions: {
    id: { name: 'hardware.id' },
    displayName: { name: 'hardware.display_name' },
    isActive: { name: 'hardware.is_active' },
    sortOrder: { name: 'hardware.sort_order' },
  },
  workOrderItems: {
    id: { name: 'work_order_items.id' },
    workOrderId: { name: 'work_order_items.work_order_id' },
    itemCode: { name: 'work_order_items.item_code' },
    quantity: { name: 'work_order_items.quantity' },
    originalDescription: { name: 'work_order_items.original_description' },
    lineTotalExcludingGst: { name: 'work_order_items.line_total_excluding_gst' },
    generatedLabel: { name: 'work_order_items.generated_label' },
    manualLabelOverride: { name: 'work_order_items.manual_label_override' },
    labelStatus: { name: 'work_order_items.label_status' },
    sourceDescriptionFingerprint: { name: 'work_order_items.source_description_fingerprint' },
    isActive: { name: 'work_order_items.is_active' },
    installerId: { name: 'work_order_items.installer_id' },
    stageOptionId: { name: 'work_order_items.stage_option_id' },
    hardwareStatusOptionId: { name: 'work_order_items.hardware_status_option_id' },
    maintenanceProgram: { name: 'work_order_items.maintenance_program' },
    installDate: { name: 'work_order_items.install_date' },
    dateCompleted: { name: 'work_order_items.date_completed' },
    riskLevelOverride: { name: 'work_order_items.risk_level_override' },
    aiRiskLevel: { name: 'work_order_items.ai_risk_level' },
    importanceOverride: { name: 'work_order_items.importance_override' },
    aiImportance: { name: 'work_order_items.ai_importance' },
    sortOrder: { name: 'work_order_items.sort_order' },
  },
  workOrderSpecificationCatalogueOptions: {
    id: { name: 'work_order_specification_catalogue_options.id' },
    fieldName: { name: 'work_order_specification_catalogue_options.field_name' },
    displayLabel: { name: 'work_order_specification_catalogue_options.display_label' },
    productionLabel: { name: 'work_order_specification_catalogue_options.production_label' },
  },
  workOrderItemProductionSpecifications: {
    id: { name: 'work_order_item_production_specifications.id' },
    workOrderItemId: { name: 'work_order_item_production_specifications.work_order_item_id' },
    status: { name: 'work_order_item_production_specifications.status' },
    draftData: { name: 'work_order_item_production_specifications.draft_data' },
    confirmedData: { name: 'work_order_item_production_specifications.confirmed_data' },
    productionLabel: { name: 'work_order_item_production_specifications.production_label' },
    evidenceData: { name: 'work_order_item_production_specifications.evidence_data' },
    ambiguityFlags: { name: 'work_order_item_production_specifications.ambiguity_flags' },
    confirmedAt: { name: 'work_order_item_production_specifications.confirmed_at' },
  },
  workOrderItemEnrichmentJobs: {
    workOrderItemId: { name: 'work_order_item_enrichment_jobs.work_order_item_id' },
    status: { name: 'work_order_item_enrichment_jobs.status' },
    lastSafeError: { name: 'work_order_item_enrichment_jobs.last_safe_error' },
    createdAt: { name: 'work_order_item_enrichment_jobs.created_at' },
  },
  workOrderItemProductionSpecificationRevisions: {
    id: { name: 'work_order_item_production_specification_revisions.id' },
    workOrderItemId: { name: 'work_order_item_production_specification_revisions.work_order_item_id' },
    actorId: { name: 'work_order_item_production_specification_revisions.actor_id' },
    revisionType: { name: 'work_order_item_production_specification_revisions.revision_type' },
    previousSnapshot: { name: 'work_order_item_production_specification_revisions.previous_snapshot' },
    newSnapshot: { name: 'work_order_item_production_specification_revisions.new_snapshot' },
    reasonCode: { name: 'work_order_item_production_specification_revisions.reason_code' },
    note: { name: 'work_order_item_production_specification_revisions.note' },
    createdAt: { name: 'work_order_item_production_specification_revisions.created_at' },
  },
  workOrderInstallers: {
    id: { name: 'installers.id' },
    displayName: { name: 'installers.display_name' },
    isActive: { name: 'installers.is_active' },
  },
  workOrders: {
    id: { name: 'work_orders.id' },
    servicem8Status: { name: 'work_orders.servicem8_status' },
    isCurrent: { name: 'work_orders.is_current' },
    jobNumber: { name: 'work_orders.job_number' },
    jobAddress: { name: 'work_orders.job_address' },
    jobDescription: { name: 'work_orders.job_description' },
    clientName: { name: 'work_orders.client_name' },
    companyName: { name: 'work_orders.company_name' },
    leadScore: { name: 'work_orders.lead_score' },
    installerId: { name: 'work_orders.installer_id' },
    stageOptionId: { name: 'work_orders.stage_option_id' },
    hardwareStatusOptionId: { name: 'work_orders.hardware_status_option_id' },
    maintenanceProgram: { name: 'work_orders.maintenance_program' },
    installDate: { name: 'work_orders.install_date' },
    dateCompleted: { name: 'work_orders.date_completed' },
    riskLevelOverride: { name: 'work_orders.risk_level_override' },
    aiRiskLevel: { name: 'work_orders.ai_risk_level' },
    importanceOverride: { name: 'work_orders.importance_override' },
    aiImportance: { name: 'work_orders.ai_importance' },
    aiSuggestion: { name: 'work_orders.ai_suggestion' },
    aiSuggestionAt: { name: 'work_orders.ai_suggestion_at' },
    clientContextSummary: { name: 'work_orders.client_context_summary' },
    clientApproachNote: { name: 'work_orders.client_approach_note' },
    updatedAt: { name: 'work_orders.updated_at' },
    servicem8JobUuid: { name: 'work_orders.servicem8_job_uuid' },
  },
  workOrderStageOptions: {
    id: { name: 'stages.id' },
    displayName: { name: 'stages.display_name' },
    isActive: { name: 'stages.is_active' },
    sortOrder: { name: 'stages.sort_order' },
  },
}))

vi.mock('@rgtools/db/schema', () => ({
  users: {
    id: { name: 'users.id' },
    username: { name: 'users.username' },
  },
}))

function queryBuilder(result: unknown) {
  const builder: Record<string, unknown> = {}
  builder.leftJoin = vi.fn(() => builder)
  builder.innerJoin = vi.fn(() => builder)
  builder.groupBy = vi.fn(() => builder)
  builder.orderBy = vi.fn((...orders: unknown[]) => {
    orderByCalls.push(orders)
    return builder
  })
  builder.where = vi.fn((condition: unknown) => {
    whereCalls.push(condition)
    return builder
  })
  builder.limit = vi.fn(() => builder)
  builder.limit = vi.fn((value: unknown) => {
    limitCalls.push(value)
    return builder
  })
  builder.offset = vi.fn(async (value: unknown) => {
    offsetCalls.push(value)
    return result
  })
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return builder
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn((shape: Record<string, unknown>) => ({
      from: vi.fn(() => {
        selectShapes.push(shape)
        return queryBuilder(
        selectResults.length > 0
          ? selectResults.shift()
          : ('total' in shape ? [{ total: 0 }] : []),
        )
      }),
    })),
  },
}))

import { getWorkOrderDetail, listWorkOrders, listWorkOrdersForExport, WORK_ORDER_EXPORT_MAX_ROWS } from '../queries'
import type { WorkOrderBaseRow } from '../queries'
import type { WorkOrderListFilters } from '../list-filters'
import type { WorkOrderItemSummaryRow } from '../work-order-items'

const filters: WorkOrderListFilters = {
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

beforeEach(() => {
  vi.clearAllMocks()
  orderByCalls.length = 0
  whereCalls.length = 0
  limitCalls.length = 0
  offsetCalls.length = 0
  selectResults.length = 0
  selectShapes.length = 0
})

describe('listWorkOrders', () => {
  it('selects the current Production Specification and immutable history with each item row', async () => {
    const workOrder = workOrderRow({ id: 'work-order-with-specification' })
    selectResults.push([{ total: 1 }], [workOrder], [])

    await listWorkOrders(filters)

    expect(selectShapes[2]).toEqual(expect.objectContaining({
      productionSpecification: expect.objectContaining({
        id: expect.anything(),
        status: expect.anything(),
        draftData: expect.anything(),
        confirmedData: expect.anything(),
        productionLabel: expect.anything(),
        evidenceData: expect.anything(),
        ambiguityFlags: expect.anything(),
        confirmedAt: expect.anything(),
        history: expect.objectContaining({ type: 'sql' }),
      }),
      enrichmentStatus: expect.objectContaining({
        status: expect.objectContaining({ type: 'sql' }),
        lastSafeError: expect.objectContaining({ type: 'sql' }),
      }),
    }))
  })

  it('excludes non-current records by default without narrowing to one ServiceM8 status', async () => {
    await listWorkOrders(filters)

    expect(whereCalls[1]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: [{ type: 'eq', column: 'work_orders.is_current', value: true }],
    }))
  })

  it('searches the summary identifiers staff use in quote tracker and lead intake', async () => {
    await listWorkOrders({ ...filters, q: 'R260210' })

    expect(whereCalls[1]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        expect.objectContaining({
          type: 'or',
          conditions: expect.arrayContaining([
            { type: 'ilike', column: 'work_orders.client_name', value: '%R260210%' },
            { type: 'ilike', column: 'work_orders.company_name', value: '%R260210%' },
            { type: 'ilike', column: 'work_orders.job_number', value: '%R260210%' },
            { type: 'ilike', column: 'work_orders.job_address', value: '%R260210%' },
            { type: 'ilike', column: 'work_orders.job_description', value: '%R260210%' },
          ]),
        }),
      ]),
    }))
    const searchCondition = (whereCalls[1] as { conditions: Array<{ type?: string; conditions?: unknown[] }> })
      .conditions.find((condition) => condition.type === 'or')
    expect(searchCondition?.conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'sql', text: expect.stringContaining('exists') }),
    ]))
  })

  it('selects parent pages through current confirmed specification search and canonical filters only', async () => {
    await listWorkOrders({
      ...filters,
      q: 'matte black',
      specification: { hardwareFinish: 'hardware_finish.matte-black' },
    })

    const sqlText = collectSqlText(whereCalls[1])
    expect(sqlText).toContain('production_label')
    expect(sqlText).toContain('confirmed_data')
    expect(sqlText).toContain('catalogueId')
    expect(sqlText).toContain('jsonb_array_elements')
    expect(sqlText).not.toContain('confirmed_data::text')
    expect(sqlText).not.toContain('draft_data')
    expect(sqlText).not.toContain('evidence_data')
    expect(sqlText).not.toContain('revision')
    expect(limitCalls).toEqual([5])
    expect(offsetCalls).toEqual([0])
  })

  it('pages parent Work Orders and uses a deterministic default score order', async () => {
    await listWorkOrders(filters)

    expect(limitCalls).toEqual([5])
    expect(offsetCalls).toEqual([0])
    expect(orderByCalls[0]).toHaveLength(6)
    expect(orderByCalls[0][0]).toEqual(expect.objectContaining({
      type: 'sql',
      text: '? desc nulls last',
    }))
    expect(orderByCalls[0][3]).toEqual(expect.objectContaining({
      type: 'sql',
      text: '? asc nulls last',
    }))
    expect(orderByCalls[0][4]).toEqual({ direction: 'asc', column: 'work_orders.updated_at' })
    expect(orderByCalls[0][5]).toEqual({ direction: 'asc', column: 'work_orders.id' })
  })

  it('sorts text columns in either direction', async () => {
    await listWorkOrders({ ...filters, sort: 'client_asc' })
    await listWorkOrders({ ...filters, sort: 'client_desc' })

    expect(orderByCalls[0][0]).toEqual(expect.objectContaining({
      type: 'sql',
      text: 'lower(?) asc nulls last',
    }))
    expect(orderByCalls[1][0]).toEqual(expect.objectContaining({
      type: 'sql',
      text: 'lower(?) desc nulls last',
    }))
  })

  it('sorts date and number columns with explicit directions', async () => {
    await listWorkOrders({ ...filters, sort: 'install_date_asc' })
    await listWorkOrders({ ...filters, sort: 'date_completed_desc' })
    await listWorkOrders({ ...filters, sort: 'lead_score_asc' })

    expect(orderByCalls[0][0]).toEqual(expect.objectContaining({
      type: 'sql',
      text: '? asc nulls last',
    }))
    expect(orderByCalls[1][0]).toEqual(expect.objectContaining({
      type: 'sql',
      text: '? desc nulls last',
    }))
    expect(orderByCalls[2][0]).toEqual(expect.objectContaining({
      type: 'sql',
      text: '? asc nulls last',
    }))
  })

  it('derives operational sort values from active items with deterministic tie breakers', async () => {
    await listWorkOrders({ ...filters, sort: 'importance_desc' })
    await listWorkOrders({ ...filters, sort: 'risk_asc' })
    await listWorkOrders({ ...filters, sort: 'install_date_asc' })
    await listWorkOrders({ ...filters, sort: 'install_date_desc' })

    const importanceAggregate = (orderByCalls[0][0] as { values: Array<{ text?: string }> }).values[0]
    const riskAggregate = (orderByCalls[1][0] as { values: Array<{ text?: string }> }).values[0]
    const earliestInstallDate = (orderByCalls[2][0] as { values: Array<{ text?: string }> }).values[0]
    const latestInstallDate = (orderByCalls[3][0] as { values: Array<{ text?: string }> }).values[0]

    expect(importanceAggregate.text).toContain('select max')
    expect(riskAggregate.text).toContain('select max')
    expect(earliestInstallDate.text).toContain('select min')
    expect(latestInstallDate.text).toContain('select max')
    for (const orders of orderByCalls) {
      expect(orders.at(-1)).toEqual({ direction: 'asc', column: 'work_orders.id' })
    }
  })

  it('exports the filtered and sorted rows without pagination', async () => {
    await listWorkOrdersForExport({ ...filters, q: 'R260210', sort: 'client_asc' })

    expect(whereCalls[0]).toEqual(expect.objectContaining({
      type: 'and',
      conditions: expect.arrayContaining([
        expect.objectContaining({ type: 'or' }),
      ]),
    }))
    expect(orderByCalls[0][0]).toEqual(expect.objectContaining({
      type: 'sql',
      text: 'lower(?) asc nulls last',
    }))
    expect(limitCalls).toEqual([WORK_ORDER_EXPORT_MAX_ROWS + 1])
    expect(offsetCalls).toEqual([])
  })

  it('returns one export row for every included Work Order item', async () => {
    const workOrder = {
      id: 'work-order-1',
      servicem8Status: 'Work Order',
      isCurrent: true,
      jobNumber: 'R260199',
      jobAddress: '19 Glass Lane',
      jobDescription: 'Replace glazing',
      clientName: 'Aroha Glass',
      companyName: null,
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
    } satisfies WorkOrderBaseRow
    const firstItem = workOrderItem({ id: 'item-1', itemCode: 'GLASS-01' })
    const secondItem = workOrderItem({ id: 'item-2', itemCode: 'GLASS-02' })
    selectResults.push([workOrder], [firstItem, secondItem])

    const rows = await listWorkOrdersForExport(filters)

    expect(rows).toEqual([
      { ...workOrder, item: firstItem },
      { ...workOrder, item: secondItem },
    ])
  })

  it('rejects an export that exceeds the bounded Work Order parent set', async () => {
    selectResults.push(Array.from({ length: WORK_ORDER_EXPORT_MAX_ROWS + 1 }, (_, index) => (
      workOrderRow({ id: `work-order-${index}` })
    )))

    await expect(listWorkOrdersForExport(filters)).rejects.toThrow(
      `Work Order export exceeds the ${WORK_ORDER_EXPORT_MAX_ROWS}-row limit. Narrow the filters and try again.`,
    )
  })

  it('keeps a zero-item Work Order in the export with a blank item', async () => {
    const workOrder = workOrderRow({ id: 'empty-work-order', jobNumber: 'R260200' })
    selectResults.push([workOrder], [])

    const rows = await listWorkOrdersForExport(filters)

    expect(rows).toEqual([{ ...workOrder, item: null }])
  })

  it('exports only child items matching item search and configured filters', async () => {
    const workOrder = workOrderRow({ id: 'filtered-work-order' })
    const matchingItem = workOrderItem({
      id: 'matching-item',
      workOrderId: workOrder.id,
      originalDescription: 'Balustrade glass',
      stageOptionId: 'stage-production',
    })
    const wrongStage = workOrderItem({
      id: 'wrong-stage',
      workOrderId: workOrder.id,
      originalDescription: 'Balustrade hardware',
      stageOptionId: 'stage-measure',
    })
    const wrongSearch = workOrderItem({
      id: 'wrong-search',
      workOrderId: workOrder.id,
      originalDescription: 'Shower glass',
      stageOptionId: 'stage-production',
    })
    selectResults.push([workOrder], [matchingItem, wrongStage, wrongSearch])

    const rows = await listWorkOrdersForExport({
      ...filters,
      q: 'balustrade',
      stage: 'stage-production',
    })

    expect(rows).toEqual([{ ...workOrder, item: matchingItem }])
  })

  it('includes removed items only when Show removed items is active', async () => {
    const workOrder = workOrderRow({ id: 'restored-work-order' })
    const removedItem = workOrderItem({
      id: 'removed-item',
      workOrderId: workOrder.id,
      isActive: false,
    })
    selectResults.push([workOrder], [removedItem])

    const rows = await listWorkOrdersForExport({ ...filters, showRemovedItems: true })

    expect(rows).toEqual([{ ...workOrder, item: removedItem }])
    expect(whereCalls[1]).toEqual({
      type: 'inArray',
      column: 'work_order_items.work_order_id',
      values: [workOrder.id],
    })
  })

  it('returns active and removed item records for detailed Work Order review', async () => {
    const workOrder = {
      ...workOrderRow({ id: 'detail-work-order', jobNumber: 'R260210' }),
      servicem8JobUuid: 'servicem8-job-1',
      servicem8Active: true,
      clientId: null,
      clientNotes: null,
      leadId: null,
      quoteId: null,
      rawServiceM8Snapshot: {},
      riskSource: null,
      importanceSource: null,
    }
    const activeItem = workOrderItem({ id: 'active-item', workOrderId: workOrder.id })
    const removedItem = workOrderItem({ id: 'removed-item', workOrderId: workOrder.id, isActive: false })
    selectResults.push([workOrder], [], [activeItem, removedItem])

    const detail = await getWorkOrderDetail(workOrder.id)

    expect(detail?.items).toEqual([activeItem, removedItem])
  })

  it('filters maintenance program rows when requested', async () => {
    await listWorkOrders({ ...filters, maintenanceProgram: 'yes' })

    const itemExists = (whereCalls[1] as { conditions: Array<{ type?: string; values?: unknown[] }> })
      .conditions.find((condition) => condition.type === 'sql')
    const itemConditions = itemExists?.values?.find(
      (value): value is { type: string; conditions: unknown[] } => Boolean(
        value && typeof value === 'object' && (value as { type?: string }).type === 'and',
      ),
    )
    expect(itemConditions?.conditions).toEqual(expect.arrayContaining([
      { type: 'eq', column: 'work_order_items.is_active', value: true },
      { type: 'eq', column: 'work_order_items.maintenance_program', value: true },
    ]))
  })
})

function workOrderItem(overrides: Partial<WorkOrderItemSummaryRow>): WorkOrderItemSummaryRow {
  return {
    id: 'item-1',
    workOrderId: 'work-order-1',
    itemCode: 'GLASS-01',
    quantity: '1.000',
    originalDescription: 'Original item description',
    lineTotalExcludingGst: '1200.00',
    generatedLabel: 'Generated item label',
    manualLabelOverride: null,
    isActive: true,
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
    ...overrides,
  }
}

function workOrderRow(overrides: Partial<WorkOrderBaseRow>): WorkOrderBaseRow {
  return {
    id: 'work-order-1',
    servicem8Status: 'Work Order',
    isCurrent: true,
    jobNumber: 'R260199',
    jobAddress: '19 Glass Lane',
    jobDescription: 'Replace glazing',
    clientName: 'Aroha Glass',
    companyName: null,
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
    ...overrides,
  }
}

function collectSqlText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(collectSqlText).join(' ')
  const record = value as Record<string, unknown>
  return [
    typeof record.text === 'string' ? record.text : '',
    ...Object.values(record).map(collectSqlText),
  ].join(' ')
}
