import { getTableName } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { workOrderEvents, workOrderRefreshRuns, workOrders } from '@rgtools/db/schema-workorders'
import {
  calculateWorkOrderRetentionCutoffs,
  cleanupExpiredWorkOrderData,
  WORK_ORDER_HISTORY_RETENTION_YEARS,
  WORK_ORDER_REFRESH_RUN_RETENTION_YEARS,
} from '../retention'

describe('Work Order retention', () => {
  it('uses the approved seven-year history and two-year refresh-run windows', () => {
    const { historyCutoff, refreshRunCutoff } = calculateWorkOrderRetentionCutoffs(new Date('2026-07-16T12:00:00.000Z'))

    expect(WORK_ORDER_HISTORY_RETENTION_YEARS).toBe(7)
    expect(WORK_ORDER_REFRESH_RUN_RETENTION_YEARS).toBe(2)
    expect(historyCutoff.toISOString()).toBe('2019-07-16T12:00:00.000Z')
    expect(refreshRunCutoff.toISOString()).toBe('2024-07-16T12:00:00.000Z')
  })

  it('deletes only through the explicit transactional cleanup seams', async () => {
    const deletedRows = new Map([
      ['work_order_events', [{ id: 'event-1' }]],
      ['work_order_refresh_runs', [{ id: 'run-1' }, { id: 'run-2' }]],
      ['work_orders', [{ id: 'work-order-1' }]],
    ])
    const tx = {
      delete: vi.fn((table: Parameters<typeof getTableName>[0]) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => deletedRows.get(getTableName(table)) ?? []),
        })),
      })),
    }
    const database = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    }

    await expect(cleanupExpiredWorkOrderData(database as never, new Date('2026-07-16T12:00:00.000Z'))).resolves.toEqual({
      workOrdersDeleted: 1,
      eventsDeleted: 1,
      refreshRunsDeleted: 2,
    })
    expect(tx.delete).toHaveBeenCalledTimes(3)
    expect(tx.delete).toHaveBeenNthCalledWith(1, workOrderEvents)
    expect(tx.delete).toHaveBeenNthCalledWith(2, workOrderRefreshRuns)
    expect(tx.delete).toHaveBeenNthCalledWith(3, workOrders)
  })
})
