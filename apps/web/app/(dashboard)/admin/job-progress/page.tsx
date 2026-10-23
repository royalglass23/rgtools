import { auth } from '@/lib/auth'
import { PaginationBar } from '@/components/pagination/PaginationBar'
import { requireModule } from '@/lib/guard'
import { getJobProgressSnapshot, type JobProgressRow } from '@/modules/job-progress/registry'
import { parseJobProgressDays, updatedWithinDays, type JobProgressDays } from '@/modules/job-progress/period'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type View = 'all' | 'review' | 'upcoming'
type PageSize = 5 | 10 | 20 | 50
const DEFAULT_PAGE_SIZE: PageSize = 5
const PAGE_SIZES: readonly PageSize[] = [5, 10, 20, 50]

function param(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

function href(view: View, q: string, days: JobProgressDays, pageSize: PageSize, page = 1): string {
  const query = new URLSearchParams()
  if (view !== 'all') query.set('view', view)
  if (q) query.set('q', q)
  if (days !== 7) query.set('days', String(days))
  if (pageSize !== DEFAULT_PAGE_SIZE) query.set('size', String(pageSize))
  if (page > 1) query.set('page', String(page))
  const suffix = query.toString()
  return `/admin/job-progress${suffix ? `?${suffix}` : ''}`
}

function dateTime(value: string | null): string {
  if (!value) return 'Not available'
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : 'Not available'
}

function amount(value: number | null): string {
  return value === null ? 'Not available' : new Intl.NumberFormat('en-NZ', {
    style: 'currency', currency: 'NZD', maximumFractionDigits: 2,
  }).format(value)
}

function summary(row: JobProgressRow): string {
  if (!row.description) return `${row.status}. Job description is not available.`
  const compact = row.description.replace(/\s+/g, ' ').trim()
  return `${row.status}. ${compact.length > 170 ? `${compact.slice(0, 167)}…` : compact}`
}

export default async function JobProgressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (session.user.role !== 'admin') redirect('/?denied=admin')
  await requireModule('admin')

  const params = await searchParams
  const rawView = param(params.view)
  const view: View = rawView === 'review' || rawView === 'upcoming' ? rawView : 'all'
  const days = parseJobProgressDays(param(params.days))
  const q = param(params.q).trim().slice(0, 100)
  const requestedSize = Number(param(params.size))
  const pageSize: PageSize = PAGE_SIZES.includes(requestedSize as PageSize) ? requestedSize as PageSize : DEFAULT_PAGE_SIZE
  const requestedPage = Number(param(params.page))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1

  let snapshot
  try {
    snapshot = await getJobProgressSnapshot()
  } catch {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-6">
        <h1 className="text-2xl font-semibold text-slate-950">Job progress is unavailable</h1>
        <p className="mt-2 text-sm text-slate-700">The complete ServiceM8 job and schedule read did not finish. No partial list or “No Upcoming Booking” result is shown.</p>
        <a className="mt-4 inline-block text-sm font-semibold text-teal-800 underline" href="/admin/job-progress">Try again</a>
      </div>
    )
  }

  const periodRows = snapshot.rows.filter((row) => updatedWithinDays(row.lastUpdate, snapshot.asOf, days))
  const reviewCount = periodRows.filter((row) => row.reviewCandidate).length
  const upcomingCount = periodRows.filter((row) => row.nextBooking).length
  const needle = q.toLocaleLowerCase('en-NZ')
  const filtered = periodRows.filter((row) => {
    if (view === 'review' && !row.reviewCandidate) return false
    if (view === 'upcoming' && !row.nextBooking) return false
    return !needle || [row.jobNumber, row.customer, row.address, row.status]
      .some((value) => value?.toLocaleLowerCase('en-NZ').includes(needle))
  })
  if (view === 'upcoming') {
    filtered.sort((a, b) => a.nextBooking!.start.localeCompare(b.nextBooking!.start) ||
      (a.jobNumber ?? '').localeCompare(b.jobNumber ?? '', 'en', { numeric: true }))
  }
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Operations overview</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Job progress</h1>
        <p className="mt-1 text-sm text-slate-600">Jobs returned by the configured ServiceM8 connection, with recorded details and the next booking.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric value={periodRows.length} label={days === 'all' ? 'Jobs returned' : `Jobs updated in ${days} days`} />
        <Metric value={reviewCount} label="Review candidates" />
        <Metric value={upcomingCount} label="Upcoming bookings" />
      </div>

      <section aria-labelledby="register-title" className="rounded border border-slate-200 bg-white">
        <div className="flex flex-col items-start gap-3 border-b border-slate-200 p-4">
          <h2 id="register-title" className="text-lg font-semibold text-slate-950">Job register</h2>
          <div className="flex w-full flex-wrap items-end justify-between gap-3">
            <form className="flex flex-wrap items-end gap-2" action="/admin/job-progress" method="get">
              {view !== 'all' && <input type="hidden" name="view" value={view} />}
              {days !== 7 && <input type="hidden" name="days" value={days} />}
              {pageSize !== DEFAULT_PAGE_SIZE && <input type="hidden" name="size" value={pageSize} />}
              <div><label htmlFor="job-progress-search" className="mb-1 block text-xs font-semibold text-slate-700">Find a job</label><input id="job-progress-search" name="q" type="search" defaultValue={q} placeholder="Number, customer or site" className="min-h-11 w-60 max-w-full rounded border border-slate-300 px-3 text-sm" /></div>
              <button type="submit" className="min-h-11 rounded bg-slate-900 px-4 text-sm font-semibold text-white">Search</button>
            </form>
            <div className="w-full text-left text-xs leading-5 text-slate-600 sm:w-auto sm:text-right">
              <p>As at {new Date(snapshot.asOf).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })} NZ time</p>
              <p>{filtered.length} matching jobs of {snapshot.rows.length} returned</p>
              <p>One row per ServiceM8 job</p>
            </div>
          </div>
        </div>
        <nav aria-label="Update period" className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4 text-sm font-semibold">
          <span className="mr-1 text-slate-600">Updated within</span>
          <ViewLink active={days === 7} href={href(view, q, 7, pageSize)}>7 days</ViewLink>
          <ViewLink active={days === 14} href={href(view, q, 14, pageSize)}>14 days</ViewLink>
          <ViewLink active={days === 30} href={href(view, q, 30, pageSize)}>30 days</ViewLink>
          <ViewLink active={days === 'all'} href={href(view, q, 'all', pageSize)}>All dates</ViewLink>
          <span className="w-full text-xs font-normal text-slate-600">Uses the job record edit date. Diary activity is not included.</span>
        </nav>
        <nav aria-label="Job views" className="flex flex-wrap gap-2 border-b border-slate-200 p-4 text-sm font-semibold">
          <ViewLink active={view === 'all'} href={href('all', q, days, pageSize)}>All jobs in period</ViewLink>
          <ViewLink active={view === 'review'} href={href('review', q, days, pageSize)}>Review candidates</ViewLink>
          <ViewLink active={view === 'upcoming'} href={href('upcoming', q, days, pageSize)}>Upcoming bookings</ViewLink>
        </nav>
        {rows.length === 0 ? <p className="p-6 text-sm text-slate-600">No jobs match this view. Clear the search, choose All jobs in period, or select All dates.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] table-fixed text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600"><tr>
                <th className="w-[9%] p-3">Job number</th><th className="w-[18%] p-3">Customer / site address</th><th className="w-[11%] p-3">Job value</th><th className="w-[12%] p-3">Last update</th><th className="w-[27%] p-3">Job summary</th><th className="w-[14%] p-3">Next upcoming booking</th><th className="w-[9%] p-3">Follow-up</th>
              </tr></thead>
              <tbody>{rows.map((row) => <tr key={row.uuid} className="border-t border-slate-200 align-top">
                <td className="p-3 font-semibold text-teal-800">{row.jobNumber ?? 'Number missing'}<span className="mt-1 block text-xs font-normal text-slate-500">{row.status}{row.active ? '' : ' · Inactive'}</span>{row.duplicateNumber && <span className="mt-1 block text-xs font-semibold text-amber-800">Duplicate number · {row.uuid.slice(0, 8)}</span>}</td>
                <td className="p-3"><strong className="block font-semibold text-slate-900">{row.customer ?? 'Customer unavailable'}</strong><span className="mt-1 block text-xs text-slate-600">{row.address ?? 'Site address unavailable'}</span></td>
                <td className="p-3"><strong>{amount(row.recordedAmount)}</strong><span className="mt-1 block text-xs text-slate-600">{row.amountSource === 'line items' ? 'Line items + 15% GST' : row.amountSource === 'invoice' ? 'Invoice amount' : 'Value unavailable'}</span></td>
                <td className="p-3"><strong>{dateTime(row.lastUpdate)}</strong><span className="mt-1 block text-xs text-slate-600">Job record edit</span></td>
                <td className="p-3"><span className="block leading-relaxed">{summary(row)}</span><span className="mt-2 block text-xs font-semibold text-amber-800">Next action: not verified from Diary</span></td>
                <td className="p-3">{row.nextBooking ? <><strong>{dateTime(row.nextBooking.start)}</strong><span className="mt-1 block text-xs text-slate-600">{row.nextBooking.staff ?? 'Staff unavailable'}</span></> : <strong className="text-amber-800">No Upcoming Booking</strong>}</td>
                <td className="p-3">{row.reviewCandidate ? <span className="inline-block border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">Review</span> : <span className="text-xs text-slate-600">Not flagged</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
        <PaginationBar
          count={`${filtered.length} ${filtered.length === 1 ? 'job' : 'jobs'}`}
          page={currentPage}
          pageCount={pageCount}
          label="Job progress pages"
          className="border-t border-slate-200 p-4"
          previous={currentPage > 1 ? <a href={href(view, q, days, pageSize, currentPage - 1)}>Previous</a> : <span aria-disabled="true">Previous</span>}
          next={currentPage < pageCount ? <a href={href(view, q, days, pageSize, currentPage + 1)}>Next</a> : <span aria-disabled="true">Next</span>}
          pageSize={<form action="/admin/job-progress" method="get">
              {view !== 'all' && <input type="hidden" name="view" value={view} />}
              {q && <input type="hidden" name="q" value={q} />}
              {days !== 7 && <input type="hidden" name="days" value={days} />}
              <label htmlFor="job-progress-size">Page size</label>
              <select id="job-progress-size" name="size" defaultValue={String(pageSize)} className="min-h-9 rounded border border-slate-300 bg-white px-2 text-sm text-slate-900">
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <button type="submit" className="min-h-9 rounded border border-slate-300 px-3 font-semibold text-slate-800">Apply</button>
            </form>}
        />
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-600">{snapshot.unnumberedJobs} jobs lack a number; {snapshot.duplicateNumberJobs} share a duplicate number; {snapshot.missingCustomer} lack a customer; {snapshot.missingAddress} lack a site address; {snapshot.missingValue} lack a positive value.</p>
      </section>
    </div>
  )
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="rounded border border-slate-200 bg-white p-4"><strong className="block text-2xl font-semibold text-slate-950">{value}</strong><span className="text-xs text-slate-600">{label}</span></div>
}

function ViewLink({ active, href: destination, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return <a aria-current={active ? 'page' : undefined} className={active ? 'rounded border border-teal-700 bg-teal-50 px-3 py-2 text-teal-900' : 'rounded border border-slate-200 px-3 py-2 text-slate-800'} href={destination}>{children}</a>
}
