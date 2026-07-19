import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/guard'
import { getQuoteMovementRecord } from '@/modules/quote-movement/queries'
import {
  formatQuoteMovementCurrency,
  formatQuoteMovementDate,
  quoteMovementDisplayName,
} from '@/modules/quote-movement/presentation'

export default async function QuoteMovementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireModule('quote-tracker')
  const { id } = await params
  const record = await getQuoteMovementRecord(id)

  if (!record) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-medium text-[#142B3A] underline-offset-2 hover:underline" href="/quote-movement">
          Back to Quote Movement
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-gray-950">
          {quoteMovementDisplayName(record)}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Cached from ServiceM8 on {formatQuoteMovementDate(record.lastServiceM8SyncedAt)}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailCard label="Customer" value={record.customerName} />
        <DetailCard label="Address" value={record.jobAddress ?? '-'} />
        <DetailCard label="Quote value excl. GST" value={formatQuoteMovementCurrency(record.quoteValueExcludingGst)} />
        <DetailCard label="Active status" value={record.servicem8Active ? 'Active' : 'Inactive'} />
      </div>

      <section className="rounded border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-950">What Matters Now</h2>
        <p className="mt-2 text-sm text-gray-600">
          Conversion history, quote summaries, complexity, and follow-up timing land here in the next Quote Movement slices.
        </p>
      </section>
    </div>
  )
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-gray-950">{value}</div>
    </div>
  )
}
