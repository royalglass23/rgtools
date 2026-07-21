import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrderEvents, workOrderRefreshRuns, workOrders } from '@rgtools/db/schema-workorders'

export const WORK_ORDER_HISTORY_RETENTION_YEARS = 7
export const WORK_ORDER_REFRESH_RUN_RETENTION_YEARS = 2

export type WorkOrderRetentionCleanupResult = {
  workOrdersDeleted: number
  eventsDeleted: number
  refreshRunsDeleted: number
}

export function calculateWorkOrderRetentionCutoffs(now = new Date()) {
  return {
    historyCutoff: subtractUtcYears(now, WORK_ORDER_HISTORY_RETENTION_YEARS),
    refreshRunCutoff: subtractUtcYears(now, WORK_ORDER_REFRESH_RUN_RETENTION_YEARS),
  }
}

export async function cleanupExpiredWorkOrderData(
  database: Pick<typeof db, 'transaction'> = db,
  now = new Date(),
): Promise<WorkOrderRetentionCleanupResult> {
  const { historyCutoff, refreshRunCutoff } = calculateWorkOrderRetentionCutoffs(now)
  const completedDateCutoff = historyCutoff.toISOString().slice(0, 10)

  return database.transaction(async (tx) => {
    const deletedEvents = await tx
      .delete(workOrderEvents)
      .where(lt(workOrderEvents.createdAt, historyCutoff))
      .returning({ id: workOrderEvents.id })

    const deletedRefreshRuns = await tx
      .delete(workOrderRefreshRuns)
      .where(lt(workOrderRefreshRuns.createdAt, refreshRunCutoff))
      .returning({ id: workOrderRefreshRuns.id })

    const deletedWorkOrders = await tx
      .delete(workOrders)
      .where(and(
        eq(workOrders.isCurrent, false),
        eq(workOrders.servicem8Active, false),
        or(
          lt(workOrders.dateCompleted, completedDateCutoff),
          and(isNull(workOrders.dateCompleted), lt(workOrders.updatedAt, historyCutoff)),
        ),
      ))
      .returning({ id: workOrders.id })

    return {
      workOrdersDeleted: deletedWorkOrders.length,
      eventsDeleted: deletedEvents.length,
      refreshRunsDeleted: deletedRefreshRuns.length,
    }
  })
}

function subtractUtcYears(value: Date, years: number) {
  const result = new Date(value)
  result.setUTCFullYear(result.getUTCFullYear() - years)
  return result
}
