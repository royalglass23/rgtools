import Link from 'next/link'
import { refreshQuoteMovementAction } from '@/modules/quote-movement/actions'
import { QuoteMovementRefreshButton } from '@/modules/quote-movement/QuoteMovementRefreshButton'
import {
  getQuoteMovementRefreshStatus,
  listActiveQuoteMovementRecords,
} from '@/modules/quote-movement/queries'
import {
  formatQuoteMovementCurrency,
  formatQuoteMovementDate,
} from '@/modules/quote-movement/presentation'
import { DismissibleNotice } from '@/modules/ui/DismissibleNotice'
import { requireModule } from '@/lib/guard'

export default async function QuoteMovementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireModule('quote-tracker')
  const resolvedSearchParams = await searchParams
  const refreshError = typeof resolvedSearchParams.refreshError === 'string'
    ? resolvedSearchParams.refreshError
    : null
  const [records, refreshStatus] = await Promise.all([
    listActiveQuoteMovementRecords(),
    getQuoteMovementRefreshStatus(),
  ])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950">Quote Movement</h1>
          <p className="mt-1 text-sm text-gray-500">
            {records.length} active ServiceM8 Quote jobs shown from the RG Tools cache
          </p>
        </div>
        <form action={refreshQuoteMovementAction}>
          <QuoteMovementRefreshButton />
        </form>
      </div>

      <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
        <div>
          Last refreshed: {formatQuoteMovementDate(refreshStatus.lastSuccessfulAt)}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          Last successful refresh cached {refreshStatus.lastSuccessfulCount} active Quote jobs.
        </div>
      </div>

      {refreshStatus.latestFailure && (
        <DismissibleNotice tone="error" noticeKey={`${refreshStatus.latestFailure.at.toISOString()}-${refreshStatus.latestFailure.message}`}>
          Quote Movement could not refresh from ServiceM8: {refreshStatus.latestFailure.message}
        </DismissibleNotice>
      )}

      {refreshError && !refreshStatus.latestFailure && (
        <DismissibleNotice tone="error" noticeKey={refreshError}>
          Quote Movement could not refresh from ServiceM8: {refreshError}
        </DismissibleNotice>
      )}

      {records.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          No active ServiceM8 Quote jobs.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Job number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3 text-right">Quote value excl. GST</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last synced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((record) => (
                <tr key={record.id} className="text-gray-700">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-950">
                    <Link className="text-[#142B3A] underline-offset-2 hover:underline" href={`/quote-movement/${record.id}`}>
                      {record.jobNumber ?? 'Open quote'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{record.customerName}</td>
                  <td className="px-4 py-3">{record.jobAddress ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {formatQuoteMovementCurrency(record.quoteValueExcludingGst)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                      {record.servicem8Active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {formatQuoteMovementDate(record.lastServiceM8SyncedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
