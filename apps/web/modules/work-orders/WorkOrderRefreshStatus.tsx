import { DismissibleNotice } from '@/modules/ui/DismissibleNotice'

export type WorkOrderRefreshStatusValue = {
  lastSuccessfulAt: Date | null
  lastSuccessfulJobCount: number
  lastSuccessfulItemCount: number
  lastSuccessfulExcludedLineCount: number
  latestFailure: {
    at: Date
    message: string
  } | null
}

export function WorkOrderRefreshStatus({ status }: { status: WorkOrderRefreshStatusValue }) {
  if (!status.lastSuccessfulAt && !status.latestFailure) return null

  return (
    <div className="space-y-2">
      {status.lastSuccessfulAt && (
        <DismissibleNotice
          tone="success"
          noticeKey={status.lastSuccessfulAt.toISOString()}
          dismissalStorageKey="work-orders:last-successful-sync"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">Last successful sync: {formatDateTime(status.lastSuccessfulAt)}</span>
            <span>{status.lastSuccessfulJobCount} jobs</span>
            <span>{status.lastSuccessfulItemCount} items</span>
            <span>{status.lastSuccessfulExcludedLineCount} billing lines excluded</span>
          </div>
        </DismissibleNotice>
      )}
      {status.latestFailure && (
        <DismissibleNotice tone="error" noticeKey={`${status.latestFailure.at.toISOString()}:${status.latestFailure.message}`}>
          <span className="font-medium">Latest refresh failed:</span> {status.latestFailure.message}
        </DismissibleNotice>
      )}
    </div>
  )
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Pacific/Auckland',
  }).format(value)
}
