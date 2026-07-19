// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const selectResults = vi.hoisted(() => [] as unknown[][])
const inserts = vi.hoisted(() => [] as Array<{ table: string; values: Record<string, unknown> }>)
const updates = vi.hoisted(() => [] as Array<{ table: string; values: Record<string, unknown> }>)
const executeQueries = vi.hoisted(() => [] as unknown[])

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  isNull: vi.fn((column: unknown) => ({ column, isNull: true })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}))

vi.mock('@rgtools/db/schema-workorders', () => ({
  workOrderItemEnrichmentJobs: table('enrichment_jobs', ['id']),
  workOrderItemProductionSpecifications: table('production_specifications', [
    'id', 'workOrderItemId', 'status', 'draftUpdatedBy',
  ]),
  workOrderItems: table('work_order_items', [
    'id', 'isActive', 'manualLabelOverride', 'generatedLabel', 'labelStatus', 'sourceDescriptionFingerprint',
  ]),
}))

vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn(async (query: unknown) => {
      executeQueries.push(query)
      return { rows: [] }
    }),
    transaction: vi.fn(async (callback: (tx: ReturnType<typeof transactionBoundary>) => unknown) => (
      callback(transactionBoundary())
    )),
  },
}))

import { createWorkOrderEnrichmentRuntimeStore } from '../enrichment-runtime-store'
import { createEmptyProductionSpecification } from '../production-specifications'

beforeEach(() => {
  selectResults.length = 0
  inserts.length = 0
  updates.length = 0
  executeQueries.length = 0
})

describe('Work Order enrichment runtime store', () => {
  it('claims queued enrichment only for the selected job number', async () => {
    await createWorkOrderEnrichmentRuntimeStore({ jobNumber: 'R260210' }).claim(3, 60_000)

    const query = executeQueries[0] as { strings: string[]; values: unknown[] }
    expect(query.strings.join('?')).toContain('work_orders.job_number')
    expect(query.values).toContain('R260210')
  })

  it('persists a Needs Review draft without an authoritative Production Label', async () => {
    selectResults.push(
      [{ id: 'item-1', isActive: true }],
      [],
    )
    const specification = createEmptyProductionSpecification()
    specification.system = { state: 'selected', catalogueId: 'system.shower-glass' }

    await createWorkOrderEnrichmentRuntimeStore().saveDraft({
      id: 'job-1',
      workOrderItemId: 'item-1',
      sourceDescription: 'Shower glass',
      attemptCount: 1,
      extractionSchemaVersion: 1,
      promptVersion: 'production-specification-v1',
    }, {
      schemaVersion: 1,
      specification,
      evidence: [{ field: 'system', sourceText: 'Shower glass' }],
      ambiguityFlags: [],
    }, 'test-model')

    expect(inserts.find((write) => write.table === 'production_specifications')?.values)
      .toEqual(expect.objectContaining({
        status: 'needs_review',
        productionLabel: null,
        draftSourceDescription: 'Shower glass',
        draftRevision: 1,
        draftBaseRevision: 0,
      }))
  })

  it('retains a deterministic short label as the rollout fallback after enrichment', async () => {
    selectResults.push(
      [{ id: 'item-1', isActive: true }],
      [],
    )
    const specification = createEmptyProductionSpecification()
    specification.system = { state: 'selected', catalogueId: 'system.shower-glass' }

    await createWorkOrderEnrichmentRuntimeStore().saveDraft({
      id: 'job-1',
      workOrderItemId: 'item-1',
      sourceDescription: 'Shower glass',
      attemptCount: 1,
      extractionSchemaVersion: 1,
      promptVersion: 'production-specification-v1',
    }, {
      schemaVersion: 1,
      specification,
      evidence: [{ field: 'system', sourceText: 'Shower glass' }],
      ambiguityFlags: [],
    }, 'test-model')

    expect(updates.find((write) => write.table === 'work_order_items')?.values)
      .toEqual(expect.objectContaining({
        generatedLabel: 'Shower Glass | Location TBC',
        labelStatus: 'generated',
      }))
  })

  it('builds the rollout label from the active shared catalogue snapshot', async () => {
    selectResults.push(
      [{ id: 'item-1', isActive: true }],
      [],
    )
    const specification = createEmptyProductionSpecification()
    specification.system = { state: 'selected', catalogueId: 'system.custom-rail' }

    await createWorkOrderEnrichmentRuntimeStore().saveDraft({
      id: 'job-1',
      workOrderItemId: 'item-1',
      sourceDescription: 'Custom rail system',
      attemptCount: 1,
      extractionSchemaVersion: 1,
      promptVersion: 'production-specification-v1',
    }, {
      schemaVersion: 1,
      specification,
      evidence: [{ field: 'system', sourceText: 'Custom rail system' }],
      ambiguityFlags: [],
    }, 'test-model', [{
      id: 'system.custom-rail',
      field: 'system',
      displayLabel: 'Custom Rail',
      productionLabel: 'Custom Rail',
      aliases: [],
      isActive: true,
    }])

    expect(updates.find((write) => write.table === 'work_order_items')?.values)
      .toEqual(expect.objectContaining({ generatedLabel: 'Custom Rail | Location TBC' }))
  })
})

function table(name: string, columns: string[]) {
  return Object.assign({ __name: name }, Object.fromEntries(columns.map((column) => [column, { name: `${name}.${column}` }])))
}

function transactionBoundary() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectResults.shift() ?? []),
        })),
      })),
    })),
    insert: vi.fn((target: { __name: string }) => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        inserts.push({ table: target.__name, values })
      }),
    })),
    update: vi.fn((target: { __name: string }) => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updates.push({ table: target.__name, values })
        return { where: vi.fn(async () => undefined) }
      }),
    })),
  }
}
