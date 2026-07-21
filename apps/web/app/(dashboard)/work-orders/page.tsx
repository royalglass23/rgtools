import { requireModule } from '@/lib/guard'
import { refreshWorkOrdersAction } from '@/modules/work-orders/actions'
import { parseWorkOrderListFilters } from '@/modules/work-orders/list-filters'
import { getCurrentWorkOrderPermissions } from '@/modules/work-orders/permissions'
import { getWorkOrderFilterOptions, getWorkOrderRefreshStatus, listWorkOrders } from '@/modules/work-orders/queries'
import { WorkOrdersTableControls } from '@/modules/work-orders/WorkOrdersTableControls'
import { WorkOrderRefreshStatus } from '@/modules/work-orders/WorkOrderRefreshStatus'
import { WorkOrderRefreshButton } from '@/modules/work-orders/WorkOrderRefreshButton'
import { DismissibleNotice } from '@/modules/ui/DismissibleNotice'
import { getWorkOrderSummaryConfig } from '@/modules/work-orders/summary-config'

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireModule('work-orders')
  const resolvedSearchParams = await searchParams
  const filters = parseWorkOrderListFilters(resolvedSearchParams)
  const refreshError = typeof resolvedSearchParams.refreshError === 'string' ? resolvedSearchParams.refreshError : null
  const exportHref = `/api/work-orders/export?${exportParams(resolvedSearchParams)}`
  const [{ rows, total, pageCount }, options, permissions, summaryFields, refreshStatus] = await Promise.all([
    listWorkOrders(filters),
    getWorkOrderFilterOptions(),
    getCurrentWorkOrderPermissions(),
    getWorkOrderSummaryConfig(),
    getWorkOrderRefreshStatus(),
  ])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950">Work Orders</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} jobs shown from saved RG Tools records
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={exportHref}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Export CSV
          </a>
          {permissions.canManage && (
            <form action={refreshWorkOrdersAction}>
              <WorkOrderRefreshButton />
            </form>
          )}
        </div>
      </div>

      <WorkOrderRefreshStatus status={refreshStatus} />

      {refreshError && !refreshStatus.latestFailure && (
        <DismissibleNotice tone="error" noticeKey={refreshError}>
          Work Orders could not refresh from ServiceM8: {refreshError}
        </DismissibleNotice>
      )}

      <WorkOrdersTableControls
        rows={rows}
        filters={filters}
        fields={summaryFields}
        options={options}
        total={total}
        pageCount={pageCount}
        canManage={permissions.canManage}
      />
    </div>
  )
}

function exportParams(searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'page' || key === 'refreshError') continue
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    } else if (value !== undefined) {
      params.set(key, value)
    }
  }
  return params.toString()
}
