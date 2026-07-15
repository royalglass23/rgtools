// @vitest-environment node

import { getTableName } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const transactionValues = vi.hoisted(() => [] as Array<{ table: string; values: Record<string, unknown> }>)
const transactionUpdates = vi.hoisted(() => [] as Array<{ table: string; values: Record<string, unknown> }>)
const transactionConflictSets = vi.hoisted(() => [] as Array<{ table: string; values: Record<string, unknown> }>)
const mockTransaction = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockRecordRefreshInsert = vi.hoisted(() => vi.fn())
const refreshRunValues = vi.hoisted(() => [] as Array<Record<string, unknown>>)
const persistedLabelRows = vi.hoisted(() => [] as Array<Record<string, unknown>>)
const labelUpdates = vi.hoisted(() => [] as Array<Record<string, unknown>>)
const mockGetWorkOrderBillingExclusions = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockRecordRefreshInsert,
    select: mockSelect,
    update: mockUpdate,
    transaction: mockTransaction,
  },
}))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/audit-db', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/servicem8/client', () => ({ createServiceM8RequestFromEnv: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('../permissions', () => ({
  assertCurrentUserCanConfigureWorkOrders: vi.fn(),
  assertCurrentUserCanManageWorkOrders: vi.fn(),
}))
vi.mock('../billing-exclusions', () => ({
  getWorkOrderBillingExclusions: mockGetWorkOrderBillingExclusions,
}))
vi.mock('../queries', () => ({
  findLinkedLeadAndClient: vi.fn(async () => null),
}))

import { refreshWorkOrdersFromServiceM8 } from '../actions'

beforeEach(() => {
  vi.clearAllMocks()
  transactionValues.length = 0
  transactionUpdates.length = 0
  transactionConflictSets.length = 0
  refreshRunValues.length = 0
  persistedLabelRows.length = 0
  labelUpdates.length = 0

  mockRecordRefreshInsert.mockReturnValue({
    values: vi.fn(async (values: Record<string, unknown>) => {
      refreshRunValues.push(values)
      return []
    }),
  })
  mockGetWorkOrderBillingExclusions.mockResolvedValue(['invoice', 'partial invoice', 'deposit'])

  mockSelect.mockReturnValue({
    from: vi.fn((table: Parameters<typeof getTableName>[0]) => {
      if (getTableName(table) === 'work_order_items') {
        return { where: vi.fn(async () => persistedLabelRows) }
      }
      return {
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      }
    }),
  })
  mockUpdate.mockReturnValue({
    set: vi.fn((values: Record<string, unknown>) => {
      labelUpdates.push(values)
      return { where: vi.fn(async () => []) }
    }),
  })

  mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
    const tx = {
      insert: vi.fn((table: Parameters<typeof getTableName>[0]) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          const tableName = getTableName(table)
          transactionValues.push({ table: tableName, values })

          if (tableName === 'work_orders') {
            return {
              onConflictDoUpdate: vi.fn((config: { set: Record<string, unknown> }) => {
                transactionConflictSets.push({ table: tableName, values: config.set })
                return {
                  returning: vi.fn(async () => [{ id: 'work-order-1', servicem8JobUuid: 'job-1' }]),
                }
              }),
            }
          }

          if (tableName === 'work_order_items') {
            return {
              onConflictDoUpdate: vi.fn(async (config: { set: Record<string, unknown> }) => {
                transactionConflictSets.push({ table: tableName, values: config.set })
                return []
              }),
            }
          }

          return Promise.resolve([])
        }),
      })),
      update: vi.fn((table: Parameters<typeof getTableName>[0]) => ({
        set: vi.fn((values: Record<string, unknown>) => {
          transactionUpdates.push({ table: getTableName(table), values })
          return { where: vi.fn(async () => []) }
        }),
      })),
    }

    return callback(tx)
  })
})

describe('refreshWorkOrdersFromServiceM8', () => {
  it('does not start reconciliation when a required ServiceM8 dataset is invalid', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/jobmaterial.json')) return Response.json({ rows: [] })
      return Response.json([])
    })

    await expect(refreshWorkOrdersFromServiceM8(request)).rejects.toThrow(
      'ServiceM8 jobmaterial response was invalid: expected an array.',
    )
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(refreshRunValues).toEqual([expect.objectContaining({ status: 'failed' })])
  })

  it('records row-level source validation failures before reconciliation begins', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/jobmaterial.json')) {
        return Response.json([{ uuid: 'item-1', active: 1, job_uuid: null, quantity: '1' }])
      }
      return Response.json([])
    })

    await expect(refreshWorkOrdersFromServiceM8(request)).rejects.toThrow(
      'ServiceM8 item item-1 is invalid: job UUID is required.',
    )
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(refreshRunValues).toEqual([expect.objectContaining({ status: 'failed' })])
  })

  it('follows every ServiceM8 cursor page before reconciling the complete dataset', async () => {
    const requestedPaths: string[] = []
    const request = vi.fn(async (path: string) => {
      requestedPaths.push(path)
      if (!path.startsWith('/job.json')) return Response.json([])

      const cursor = new URL(path, 'https://servicem8.example').searchParams.get('cursor')
      if (cursor === null || cursor === '-1') {
        return Response.json([{
          uuid: 'job-1',
          active: 1,
          status: 'Work Order',
          generated_job_id: 'R260210',
        }], { headers: { 'x-next-cursor': 'cursor-2' } })
      }
      if (cursor === 'cursor-2') {
        return Response.json([{
          uuid: 'job-2',
          active: 1,
          status: 'Work Order',
          generated_job_id: 'R260211',
        }])
      }

      return Response.json([], { status: 400 })
    })

    await expect(refreshWorkOrdersFromServiceM8(request)).resolves.toEqual({
      synced: 2,
      itemsSynced: 0,
      excludedLineCount: 0,
    })

    expect(transactionValues.filter((write) => write.table === 'work_orders')).toHaveLength(2)
    expect(requestedPaths).toEqual(expect.arrayContaining([
      expect.stringMatching(/^\/job\.json.*cursor=-1/),
      expect.stringMatching(/^\/job\.json.*cursor=cursor-2/),
    ]))
  })

  it('fails before reconciliation when ServiceM8 repeats a pagination cursor', async () => {
    const request = vi.fn(async (path: string) => {
      if (!path.startsWith('/job.json')) return Response.json([])
      return Response.json([{
        uuid: 'job-1',
        active: 1,
        status: 'Work Order',
        generated_job_id: 'R260210',
      }], { headers: { 'x-next-cursor': 'cursor-loop' } })
    })

    await expect(refreshWorkOrdersFromServiceM8(request)).rejects.toThrow(
      'ServiceM8 job pagination was invalid: cursor cursor-loop repeated.',
    )

    expect(mockTransaction).not.toHaveBeenCalled()
    expect(refreshRunValues).toEqual([expect.objectContaining({ status: 'failed' })])
  })

  it('records a failed run when atomic reconciliation rolls back', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('database transaction rolled back'))
    const request = vi.fn(async () => Response.json([]))

    await expect(refreshWorkOrdersFromServiceM8(request)).rejects.toThrow('database transaction rolled back')
    expect(transactionValues.some((write) => write.table === 'work_order_refresh_runs' && write.values.status === 'success')).toBe(false)
    expect(refreshRunValues).toEqual([expect.objectContaining({ status: 'failed' })])
  })

  it('persists every active item beneath one Work Order without copying job tracking values', async () => {
    const requestedPaths: string[] = []
    const request = vi.fn(async (path: string) => {
      requestedPaths.push(path)

      if (path.startsWith('/job.json')) {
        return Response.json([{
          uuid: 'job-1',
          active: 1,
          status: 'Work Order',
          generated_job_id: 'R260210',
          company_uuid: 'company-1',
        }])
      }
      if (path.startsWith('/company.json')) {
        return Response.json([{ uuid: 'company-1', name: 'Example Client' }])
      }
      if (path.startsWith('/jobmaterial.json')) {
        return Response.json([
          {
            uuid: 'item-1',
            active: 1,
            job_uuid: 'job-1',
            material_uuid: 'material-1',
            name: 'Shower glass',
            quantity: '1',
            price: '900',
            sort_order: '1',
          },
          {
            uuid: 'item-2',
            active: 1,
            job_uuid: 'job-1',
            material_uuid: 'material-2',
            name: 'Shower hardware',
            quantity: '2',
            price: '75',
            sort_order: '2',
          },
        ])
      }
      if (path.startsWith('/material.json')) {
        return Response.json([
          { uuid: 'material-1', item_number: 'GLASS-001' },
          { uuid: 'material-2', item_number: 'HARDWARE-001' },
        ])
      }

      return Response.json([], { status: 404 })
    })

    await expect(refreshWorkOrdersFromServiceM8(request)).resolves.toEqual({
      synced: 1,
      itemsSynced: 2,
      excludedLineCount: 0,
    })

    expect(requestedPaths.some((path) => path.startsWith('/jobmaterial.json'))).toBe(true)
    expect(requestedPaths.some((path) => path.startsWith('/material.json'))).toBe(true)

    const itemWrites = transactionValues.filter((write) => write.table === 'work_order_items')
    expect(itemWrites).toHaveLength(2)
    expect(itemWrites.map((write) => write.values)).toEqual([
      expect.objectContaining({
        workOrderId: 'work-order-1',
        servicem8ItemUuid: 'item-1',
        servicem8JobUuid: 'job-1',
        itemCode: 'GLASS-001',
        quantity: '1',
        originalDescription: 'Shower glass',
        lineTotalExcludingGst: '900.00',
      }),
      expect.objectContaining({
        workOrderId: 'work-order-1',
        servicem8ItemUuid: 'item-2',
        itemCode: 'HARDWARE-001',
        quantity: '2',
        originalDescription: 'Shower hardware',
        lineTotalExcludingGst: '150.00',
      }),
    ])
    for (const write of itemWrites) {
      expect(write.values).not.toHaveProperty('installerId')
      expect(write.values).not.toHaveProperty('stageOptionId')
      expect(write.values).not.toHaveProperty('hardwareStatusOptionId')
      expect(write.values).not.toHaveProperty('maintenanceProgram')
    }
  })

  it('keeps a successful ServiceM8 refresh when OpenAI label generation fails', async () => {
    persistedLabelRows.push({
      id: 'item-1',
      originalDescription: 'Shower glass',
      generatedLabel: null,
      manualLabelOverride: null,
      labelStatus: 'pending',
      sourceDescriptionFingerprint: null,
    })
    const generateLabel = vi.fn(async () => {
      throw new Error('OpenAI unavailable')
    })
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/job.json')) {
        return Response.json([{ uuid: 'job-1', active: 1, status: 'Work Order', generated_job_id: 'R260210' }])
      }
      if (path.startsWith('/jobmaterial.json')) {
        return Response.json([{ uuid: 'item-1', active: 1, job_uuid: 'job-1', name: 'Shower glass', quantity: '1' }])
      }
      return Response.json([])
    })

    await expect(refreshWorkOrdersFromServiceM8(request, generateLabel)).resolves.toEqual({
      synced: 1,
      itemsSynced: 1,
      excludedLineCount: 0,
    })

    expect(generateLabel).toHaveBeenCalledOnce()
    expect(labelUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({ labelStatus: 'failed', generatedLabel: null }),
    ]))
    expect(transactionValues).toEqual(expect.arrayContaining([
      { table: 'work_order_refresh_runs', values: expect.objectContaining({ status: 'success' }) },
    ]))
  })

  it('applies configured billing exclusions and reports job, item, and exclusion counts', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/job.json')) {
        return Response.json([{ uuid: 'job-1', active: 1, status: 'Work Order', generated_job_id: 'R260210' }])
      }
      if (path.startsWith('/jobmaterial.json')) {
        return Response.json([
          { uuid: 'item-1', active: 1, job_uuid: 'job-1', name: 'Shower glass', quantity: '1' },
          { uuid: 'invoice-1', active: 1, job_uuid: 'job-1', name: 'Partial INVOICE claim', quantity: '1' },
          { uuid: 'invoice-other', active: 1, job_uuid: 'job-other', name: 'Invoice for another job', quantity: '1' },
        ])
      }
      return Response.json([])
    })

    await expect(refreshWorkOrdersFromServiceM8(request)).resolves.toEqual({
      synced: 1,
      itemsSynced: 1,
      excludedLineCount: 1,
    })
    expect(transactionValues.filter((write) => write.table === 'work_order_items')).toHaveLength(1)
    expect(transactionValues).toEqual(expect.arrayContaining([
      {
        table: 'work_order_refresh_runs',
        values: expect.objectContaining({ syncedCount: 1, itemSyncedCount: 1, excludedLineCount: 1 }),
      },
    ]))
  })

  it('persists an empty parent without creating a placeholder item', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/job.json')) {
        return Response.json([{
          uuid: 'job-1',
          active: 1,
          status: 'Work Order',
          generated_job_id: 'R260210',
        }])
      }
      return Response.json([])
    })

    await expect(refreshWorkOrdersFromServiceM8(request)).resolves.toEqual({
      synced: 1,
      itemsSynced: 0,
      excludedLineCount: 0,
    })

    expect(transactionValues.filter((write) => write.table === 'work_orders')).toHaveLength(1)
    expect(transactionValues.filter((write) => write.table === 'work_order_items')).toHaveLength(0)
  })

  it('marks previously synced items removed after a complete refresh returns no active lines', async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith('/job.json')) {
        return Response.json([{ uuid: 'job-1', active: 1, status: 'Work Order', generated_job_id: 'R260210' }])
      }
      return Response.json([])
    })

    await refreshWorkOrdersFromServiceM8(request)

    expect(transactionUpdates).toEqual(expect.arrayContaining([
      { table: 'work_order_items', values: expect.objectContaining({ isActive: false }) },
    ]))
  })

  it('restores returning job and item identities without overwriting RG-owned item values', async () => {
    await refreshWorkOrdersFromServiceM8(vi.fn(async () => Response.json([])))

    const returningRequest = vi.fn(async (path: string) => {
      if (path.startsWith('/job.json')) {
        return Response.json([{ uuid: 'job-1', active: 1, status: 'Work Order', generated_job_id: 'R260210' }])
      }
      if (path.startsWith('/jobmaterial.json')) {
        return Response.json([{ uuid: 'item-1', active: 1, job_uuid: 'job-1', name: 'Returning glass', quantity: '1' }])
      }
      return Response.json([])
    })

    await refreshWorkOrdersFromServiceM8(returningRequest)

    expect(transactionUpdates).toEqual(expect.arrayContaining([
      { table: 'work_orders', values: expect.objectContaining({ isCurrent: false }) },
      { table: 'work_order_items', values: expect.objectContaining({ isActive: false }) },
    ]))
    expect(transactionConflictSets).toEqual(expect.arrayContaining([
      { table: 'work_orders', values: expect.objectContaining({ isCurrent: true }) },
      { table: 'work_order_items', values: expect.objectContaining({ isActive: true }) },
    ]))

    const restoredItemSet = transactionConflictSets.find((write) => write.table === 'work_order_items')?.values
    expect(restoredItemSet).not.toHaveProperty('installerId')
    expect(restoredItemSet).not.toHaveProperty('stageOptionId')
    expect(restoredItemSet).not.toHaveProperty('hardwareStatusOptionId')
    expect(restoredItemSet).not.toHaveProperty('maintenanceProgram')
  })
})
