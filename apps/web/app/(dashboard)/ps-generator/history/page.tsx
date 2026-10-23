import Link from 'next/link'
import { PaginationBar } from '@/components/pagination/PaginationBar'
import { count, desc, ilike, inArray, or, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { requireModule } from '@/lib/guard'
import { buildPsGenerationHistory, type PsHistoryGenerationRecord } from '@/modules/ps-generator/history'
import {
  psGeneratedPdfObjects,
  psGenerationEvents,
} from '@rgtools/db/schema-ps-generator'

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const
const DEFAULT_PAGE_SIZE = 5

interface PsGeneratorHistoryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PsGeneratorHistoryPage({ searchParams }: PsGeneratorHistoryPageProps) {
  await requireModule('ps-generator/history')

  const params = await searchParams
  const legacyJobNumber = parseString(params.jobNumber)
  const search = parseString(params.search) || legacyJobNumber
  const requestedPage = parsePositiveInt(params.page)
  const pageSize = parsePageSize(params.pageSize)
  const historyPage = await loadHistoryRecords({ search, page: requestedPage, pageSize })
  const history = buildPsGenerationHistory(historyPage.records, { search })
  const resetHref = buildHistoryHref({ pageSize })

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-950">PS History</h1>
        <p className="mt-1 text-sm text-gray-500">Find retained Producer Statement records and downloads.</p>
      </div>

      <form className="flex flex-col gap-3 rounded border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="pageSize" value={String(pageSize)} />
        <label className="flex-1 text-sm font-medium text-gray-700">
          Search
          <input
            name="search"
            defaultValue={search}
            placeholder="Job number, job address, or client name"
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" className="rounded bg-gray-950 px-4 py-2 text-sm font-semibold text-white">
          Search
        </button>
        {search ? (
          <Link href={resetHref} className="rounded border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-700">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Generated</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Downloads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    <time>{record.createdAt.toLocaleString('en-NZ')}</time>
                    <span className="mt-1 block text-xs text-gray-500">{record.actorLabel}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-950">{record.jobNumber ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{record.clientName}</td>
                  <td className="min-w-72 px-4 py-3 text-gray-700">{record.jobAddress}</td>
                  <td className="min-w-64 px-4 py-3 text-gray-700">
                    <span className="font-medium text-gray-950">{formatMode(record.generationMode)}</span>
                    <span className="block text-xs text-gray-500">
                      {record.systemLabel ?? 'System not recorded'}{formatOptionSummary(record.selectedOptions)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {record.downloads.length === 0 ? (
                        <span className="text-gray-500">None retained</span>
                      ) : record.downloads.map((download) => (
                        download.retained ? (
                          <Link
                            key={`${record.id}:${download.r2ObjectKey}`}
                            href={`/api/ps-generator/generated/${download.id}`}
                            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            {download.documentKind.toUpperCase()}
                          </Link>
                        ) : (
                          <span key={`${record.id}:${download.r2ObjectKey}`} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-400">
                            {download.documentKind.toUpperCase()} expired
                          </span>
                        )
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No PS generation records found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationBar
        count={`${historyPage.total} records`}
        page={historyPage.page}
        pageCount={historyPage.pageCount}
        label="PS history pages"
        previous={<PaginationLink
            href={buildHistoryHref({ search, page: historyPage.page - 1, pageSize })}
            disabled={historyPage.page <= 1}
          >Previous</PaginationLink>}
        next={<PaginationLink
            href={buildHistoryHref({ search, page: historyPage.page + 1, pageSize })}
            disabled={historyPage.page >= historyPage.pageCount}
          >Next</PaginationLink>}
        pageSize={<form action="/ps-generator/history">
          {search ? <input type="hidden" name="search" value={search} /> : null}
          <input type="hidden" name="page" value="1" />
          <label htmlFor="ps-history-page-size" className="flex items-center gap-2">
            <span className="whitespace-nowrap">Page size</span>
            <select
              id="ps-history-page-size"
              name="pageSize"
              defaultValue={String(pageSize)}
              className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-950 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Apply
          </button>
        </form>}
      />
    </div>
  )
}

async function loadHistoryRecords({
  search,
  page,
  pageSize,
}: {
  search: string
  page: number
  pageSize: number
}): Promise<{ records: PsHistoryGenerationRecord[]; total: number; page: number; pageCount: number }> {
  const where = buildHistorySearchWhere(search)
  const [{ total: rawTotal } = { total: 0 }] = await db
    .select({ total: count() })
    .from(psGenerationEvents)
    .where(where)

  const total = Number(rawTotal)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, pageCount)
  const offset = (safePage - 1) * pageSize
  const eventRows = await db
    .select()
    .from(psGenerationEvents)
    .where(where)
    .orderBy(desc(psGenerationEvents.createdAt))
    .limit(pageSize)
    .offset(offset)

  if (eventRows.length === 0) return { records: [], total, page: safePage, pageCount }

  const eventIds = eventRows.map((event) => event.id)
  const pdfRows = await db
    .select()
    .from(psGeneratedPdfObjects)
    .where(inArray(psGeneratedPdfObjects.generationEventId, eventIds))

  return {
    total,
    page: safePage,
    pageCount,
    records: eventRows.map((event) => ({
      id: event.id,
      actorLabel: event.actorLabel,
      generationMode: event.generationMode,
      jobNumber: event.jobNumber,
      clientName: event.clientName,
      jobAddress: event.jobAddress,
      bcNumber: event.bcNumber,
      lotDescription: event.lotDescription,
      selectionsSnapshot: event.selectionsSnapshot,
      descriptionSnapshot: event.descriptionSnapshot,
      createdAt: event.createdAt,
      pdfObjects: pdfRows
        .filter((object) => object.generationEventId === event.id)
        .map((object) => ({
          id: object.id,
          documentKind: object.documentKind,
          filename: object.filename,
          r2ObjectKey: object.r2ObjectKey,
          retainedUntil: object.retainedUntil,
          deletedAt: object.deletedAt,
        })),
    })),
  }
}

function buildHistorySearchWhere(search: string): SQL | undefined {
  if (!search) return undefined
  const query = `%${search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  return or(
    ilike(psGenerationEvents.jobNumber, query),
    ilike(psGenerationEvents.jobAddress, query),
    ilike(psGenerationEvents.clientName, query),
  )
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: string
}) {
  if (disabled) {
    return <span className="rounded border border-gray-200 px-3 py-1.5 text-gray-400">{children}</span>
  }

  return <Link href={href} className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50">{children}</Link>
}

function parseString(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() ?? ''
}

function parsePositiveInt(value: string | string[] | undefined): number {
  const parsed = Number(parseString(value) || '1')
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function parsePageSize(value: string | string[] | undefined): typeof PAGE_SIZE_OPTIONS[number] {
  const parsed = Number(parseString(value) || String(DEFAULT_PAGE_SIZE))
  return PAGE_SIZE_OPTIONS.includes(parsed as typeof PAGE_SIZE_OPTIONS[number])
    ? parsed as typeof PAGE_SIZE_OPTIONS[number]
    : DEFAULT_PAGE_SIZE
}

function buildHistoryHref({
  search = '',
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  search?: string
  page?: number
  pageSize?: number
}) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (page > 1) params.set('page', String(page))
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(pageSize))

  const query = params.toString()
  return query ? `/ps-generator/history?${query}` : '/ps-generator/history'
}

function formatMode(mode: PsHistoryGenerationRecord['generationMode']) {
  if (mode === 'both') return 'PS1 + PS3'
  return mode === 'ps1_only' ? 'PS1 only' : 'PS3 only'
}

function formatOptionSummary(options: Array<{ categoryLabel: string; label: string }>) {
  const summary = options
    .filter((option) => ['Structure material', 'Structure type', 'Location', 'Glass type', 'Thickness'].includes(option.categoryLabel))
    .map((option) => option.label)
    .join(', ')
  return summary ? ` - ${summary}` : ''
}
