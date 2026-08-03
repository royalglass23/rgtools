'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type { LeadsListFilters } from './queries'
import { batchDeleteLeadsAction, restoreLeadAction } from './actions'
import { saveTablePrefs } from './table-prefs-actions'
import { DEFAULT_LEADS_PREFS, type TablePrefs } from './table-prefs-shared'
import { formatAnswerKey, formatProjectType } from '../lead-intake/display-labels'
import { StatusBadge, TableShell } from '@/components/precision-ui/PrecisionUI'

type LeadRow = {
  id: string
  createdAt: Date
  clientName: string
  companyName: string | null
  location: string | null
  projectType: string | null
  tier: string | null
  seedScore: number | null
  servicem8JobUuid: string | null
  servicem8JobNumber: string | null
  servicem8Status: string | null
  syncStatus: string
  completeness: number | null
  rcStatus: string | null
  bcStatus: string | null
  buildingStage: string | null
  followUpDate: string | null
  updatedAt: Date
  aiSuggestion: string | null
}

type ColumnDef = {
  key: string
  label: string
  sortKey?: string
  className?: string
  render: (lead: LeadRow) => React.ReactNode
}

const COLUMN_DEFS: ColumnDef[] = [
  { key: 'date', label: 'Date', sortKey: 'createdAt', className: 'whitespace-nowrap text-text-secondary', render: (lead) => formatDate(lead.createdAt) },
  { key: 'client', label: 'Client', sortKey: 'clientName', render: (lead) => (
    <>
      <span className="font-medium text-text-primary">{lead.clientName}</span>
      {lead.companyName && <span className="block text-xs text-text-muted">{lead.companyName}</span>}
    </>
  ) },
  { key: 'jobNumber', label: 'Job Number', className: 'whitespace-nowrap text-text-secondary', render: (lead) => lead.servicem8JobNumber ?? '-' },
  { key: 'address', label: 'Job Address', className: 'max-w-xs text-text-secondary', render: (lead) => <span className="block truncate">{lead.location ?? '-'}</span> },
  { key: 'project', label: 'Project', className: 'text-text-secondary', render: (lead) => formatProjectType(lead.projectType) },
  { key: 'tier', label: 'Tier', sortKey: 'tier', render: (lead) => <TierBadge tier={lead.tier} /> },
  { key: 'score', label: 'Score', sortKey: 'seedScore', className: 'text-text-secondary', render: (lead) => lead.seedScore ?? '-' },
  { key: 'sm8', label: 'SM8', render: (lead) => <Sm8Badge linked={Boolean(lead.servicem8JobUuid)} status={lead.syncStatus} /> },
  { key: 'completeness', label: 'Completeness', sortKey: 'completeness', className: 'text-text-secondary', render: (lead) => lead.completeness === null ? '-' : `${lead.completeness}%` },
  { key: 'rcStatus', label: 'RC', className: 'text-text-secondary', render: (lead) => formatAnswerKey(lead.rcStatus) },
  { key: 'bcStatus', label: 'BC', className: 'text-text-secondary', render: (lead) => formatAnswerKey(lead.bcStatus) },
  { key: 'buildingStage', label: 'Building Stage', className: 'text-text-secondary', render: (lead) => formatAnswerKey(lead.buildingStage) },
  { key: 'followUpDate', label: 'Follow-up date', sortKey: 'followUpDate', className: 'whitespace-nowrap text-text-secondary', render: (lead) => formatNullableDate(lead.followUpDate) },
  { key: 'updatedAt', label: 'Last update', sortKey: 'updatedAt', className: 'whitespace-nowrap text-text-secondary', render: (lead) => formatDate(lead.updatedAt) },
  { key: 'aiSuggestion', label: 'AI suggestion', className: 'max-w-xs text-text-secondary', render: (lead) => <span className="block truncate">{lead.aiSuggestion ?? '-'}</span> },
]

const columnDefByKey = new Map(COLUMN_DEFS.map((column) => [column.key, column]))


export function LeadsTableControls({
  filters,
  rows,
  total,
  pageCount,
  isAdmin,
  prefs = DEFAULT_LEADS_PREFS,
  basePath = '/leads',
  paramPrefix = '',
}: {
  filters: LeadsListFilters
  rows: LeadRow[]
  total: number
  pageCount: number
  isAdmin: boolean
  prefs?: TablePrefs
  /** Path the filter form + pagination links target. Defaults to the Leads page. */
  basePath?: string
  /** Prefix applied to query param names so multiple tables can coexist on one URL. */
  paramPrefix?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [tablePrefs, setTablePrefs] = useState({ ...prefs, sortColumn: filters.sortColumn, sortDir: filters.sortDir })
  const [, startTransition] = useTransition()
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allVisibleSelected = rows.length > 0 && rows.every((lead) => selectedSet.has(lead.id))
  const visibleColumns = useMemo(
    () => tablePrefs.columns
      .filter((column) => column.visible)
      .map((column) => columnDefByKey.get(column.key))
      .filter((column): column is ColumnDef => Boolean(column)),
    [tablePrefs.columns],
  )

  function persistPrefs(nextPrefs: TablePrefs) {
    setTablePrefs(nextPrefs)
    startTransition(() => {
      void saveTablePrefs('leads', nextPrefs)
    })
  }

  function sortBy(sortColumn: string) {
    const sortDir = tablePrefs.sortColumn === sortColumn && tablePrefs.sortDir === 'asc' ? 'desc' : 'asc'
    persistPrefs({ ...tablePrefs, sortColumn, sortDir })
    const params = new URLSearchParams(searchParams.toString())
    params.set(`${paramPrefix}sortColumn`, sortColumn)
    params.set(`${paramPrefix}sortDir`, sortDir)
    params.set(`${paramPrefix}page`, '1')
    router.push(`${basePath}?${params}`)
  }

  function toggleLead(leadId: string) {
    setSelectedIds((current) => (
      current.includes(leadId)
        ? current.filter((id) => id !== leadId)
        : [...current, leadId]
    ))
  }

  function toggleAllVisible() {
    setSelectedIds(allVisibleSelected ? [] : rows.map((lead) => lead.id))
  }

  return (
    <>
      <FilterBar
        filters={filters}
        basePath={basePath}
        paramPrefix={paramPrefix}
        isAdmin={isAdmin}
        onSort={(column, dir) => persistPrefs({ ...tablePrefs, sortColumn: column, sortDir: dir as 'asc' | 'desc' })}
      />

      {isAdmin && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">{selectedIds.length} selected</span>
          <button
            type="submit"
            form="batch-delete-form"
            disabled={selectedIds.length === 0}
            className="rounded border border-[var(--state-critical)] px-3 py-2 text-sm font-medium text-[var(--state-critical)] hover:bg-[var(--state-critical-soft)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete selected
          </button>
        </div>
      )}

      {isAdmin && (
        <>
          <form
            id="batch-delete-form"
            action={batchDeleteLeadsAction}
            onSubmit={(event) => {
              if (selectedIds.length === 0) {
                event.preventDefault()
                return
              }

              if (!window.confirm(`Delete ${selectedIds.length} selected lead${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`)) {
                event.preventDefault()
              }
            }}
          >
          {selectedIds.map((leadId) => (
            <input key={leadId} type="hidden" name="leadId" value={leadId} />
          ))}
          </form>

          <LeadsTable
            rows={rows}
            isAdmin={isAdmin}
            isArchivedView={filters.statusView === 'archived'}
            columns={visibleColumns}
            prefs={tablePrefs}
            selectedSet={selectedSet}
            allVisibleSelected={allVisibleSelected}
            onToggleLead={toggleLead}
            onToggleAllVisible={toggleAllVisible}
            onSort={sortBy}
          />
        </>
      )}

      {!isAdmin && (
        <LeadsTable
          rows={rows}
          isAdmin={isAdmin}
          isArchivedView={filters.statusView === 'archived'}
          columns={visibleColumns}
          prefs={tablePrefs}
          selectedSet={selectedSet}
          allVisibleSelected={allVisibleSelected}
          onToggleLead={toggleLead}
          onToggleAllVisible={toggleAllVisible}
          onSort={sortBy}
        />
      )}

      <div className="grid grid-cols-3 items-center gap-3 text-sm text-text-secondary max-sm:grid-cols-1">
        <span>{total} leads</span>
        <div className="flex items-center justify-center gap-2">
          <PageLink filters={filters} page={Math.max(1, filters.page - 1)} disabled={filters.page <= 1} basePath={basePath} paramPrefix={paramPrefix}>Previous</PageLink>
          <span>Page {filters.page} of {pageCount}</span>
          <PageLink filters={filters} page={Math.min(pageCount, filters.page + 1)} disabled={filters.page >= pageCount} basePath={basePath} paramPrefix={paramPrefix}>Next</PageLink>
        </div>
        <div className="flex justify-end">
          <PageSizeSelect filters={filters} basePath={basePath} paramPrefix={paramPrefix} />
        </div>
      </div>
    </>
  )
}

function FilterBar({
  filters, basePath, paramPrefix, isAdmin, onSort,
}: {
  filters: LeadsListFilters; basePath: string; paramPrefix: string; isAdmin: boolean; onSort: (column: string, dir: string) => void
}) {
  const searchParams = useSearchParams()
  const owned = new Set(
    ['q', 'tier', 'sm8', 'date', 'stale', 'statusView', 'size', 'sortColumn', 'sortDir', 'page'].map((name) => `${paramPrefix}${name}`),
  )
  const carryOver = Array.from(searchParams.entries()).filter(([key]) => !owned.has(key))

  const resetParams = new URLSearchParams(carryOver)
  resetParams.set(`${paramPrefix}size`, String(filters.size))
  resetParams.set(`${paramPrefix}page`, '1')
  resetParams.set(`${paramPrefix}sortColumn`, 'clientName')
  resetParams.set(`${paramPrefix}sortDir`, 'asc')
  const resetHref = `${basePath}?${resetParams}`

  const filterKey = [filters.q, filters.tier, filters.sm8, filters.date, String(filters.stale), filters.statusView, filters.sortColumn, filters.sortDir].join('|')
  const statusViewOptions: Array<[string, string]> = [
    ['current_quotes', 'Current Quotes'],
    ['all_statuses', 'All statuses'],
  ]
  if (isAdmin) statusViewOptions.push(['archived', 'Archived only'])

  return (
    <form key={filterKey} action={basePath} className="grid gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4 shadow-[var(--shadow-raised)] sm:grid-cols-8">
      {carryOver.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <input type="hidden" name={`${paramPrefix}size`} value={String(filters.size)} />
      <input type="hidden" name={`${paramPrefix}page`} value="1" />
      <input type="hidden" name={`${paramPrefix}sortColumn`} value={filters.sortColumn} />
      <input type="hidden" name={`${paramPrefix}sortDir`} value={filters.sortDir} />

      <label className="block sm:col-span-2">
        <span className="text-xs font-medium text-text-secondary">Search</span>
        <div className="mt-1 flex gap-2">
          <input
            name={`${paramPrefix}q`}
            defaultValue={filters.q}
            placeholder="Client, address, phone, job number..."
            className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
          <button
            type="submit"
            className="rounded-[var(--radius-control)] bg-[var(--brand-strong)] px-3 py-2 text-sm font-medium text-[var(--text-inverse)]"
          >
            Search
          </button>
        </div>
      </label>
      <Select name={`${paramPrefix}tier`} label="Tier" value={filters.tier} options={[['all', 'All'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'], ['E', 'E']]} />
      <Select name={`${paramPrefix}sm8`} label="SM8" value={filters.sm8} options={[['all', 'All'], ['linked', 'Linked'], ['pending', 'Pending'], ['failed', 'Failed']]} />
      <Select name={`${paramPrefix}date`} label="Date" value={filters.date} options={[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['all', 'All time']]} />
      <Select name={`${paramPrefix}stale`} label="Activity" value={filters.stale ? 'true' : 'false'} options={[['false', 'All'], ['true', 'Stale (7d+)']]} />
      <LeadsSortSelect filters={filters} basePath={basePath} paramPrefix={paramPrefix} onSort={onSort} />
      <Select name={`${paramPrefix}statusView`} label="View" value={filters.statusView} options={statusViewOptions} />
      <div className="flex items-end justify-end">
        <Link href={resetHref} className="rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle">
          Reset
        </Link>
      </div>
    </form>
  )
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: Array<[string, string]> }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <select
        name={name}
        defaultValue={value}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm text-text-primary"
      >
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  )
}

function LeadsSortSelect({ filters, basePath, paramPrefix, onSort }: { filters: LeadsListFilters; basePath: string; paramPrefix: string; onSort: (column: string, dir: string) => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentValue = `${filters.sortColumn}_${filters.sortDir}`

  function handleChange(combined: string) {
    const idx = combined.lastIndexOf('_')
    const column = combined.substring(0, idx)
    const dir = combined.substring(idx + 1)
    onSort(column, dir)
    const params = new URLSearchParams(searchParams.toString())
    params.set(`${paramPrefix}sortColumn`, column)
    params.set(`${paramPrefix}sortDir`, dir)
    params.set(`${paramPrefix}page`, '1')
    router.push(`${basePath}?${params}`)
  }

  return (
    <label className="block">
      <span className="text-xs font-medium text-text-secondary">Sort</span>
      <select
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm text-text-primary"
      >
        <option value="clientName_asc">Client A–Z</option>
        <option value="clientName_desc">Client Z–A</option>
        <option value="createdAt_desc">Date newest</option>
        <option value="createdAt_asc">Date oldest</option>
        <option value="tier_asc">Tier A-E</option>
        <option value="tier_desc">Tier E-A</option>
        <option value="seedScore_desc">Score high–low</option>
        <option value="seedScore_asc">Score low–high</option>
        <option value="completeness_desc">Completeness high–low</option>
        <option value="completeness_asc">Completeness low–high</option>
        <option value="followUpDate_asc">Follow-up soonest</option>
        <option value="followUpDate_desc">Follow-up latest</option>
        <option value="updatedAt_desc">Last update newest</option>
        <option value="updatedAt_asc">Last update oldest</option>
      </select>
    </label>
  )
}

function LeadsTable({
  rows,
  isAdmin,
  isArchivedView,
  columns,
  prefs,
  selectedSet,
  allVisibleSelected,
  onToggleLead,
  onToggleAllVisible,
  onSort,
}: {
  rows: LeadRow[]
  isAdmin: boolean
  isArchivedView: boolean
  columns: ColumnDef[]
  prefs: TablePrefs
  selectedSet: Set<string>
  allVisibleSelected: boolean
  onToggleLead: (leadId: string) => void
  onToggleAllVisible: () => void
  onSort: (sortColumn: string) => void
}) {
  return (
    <TableShell label="Leads table">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
          <tr>
            {isAdmin && (
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleAllVisible}
                  aria-label="Select all visible leads"
                   className="h-4 w-4 rounded border-border"
                />
              </th>
            )}
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3">
                <SortableHeader column={column} prefs={prefs} onSort={onSort} />
              </th>
            ))}
            {isAdmin && isArchivedView && (
              <th className="px-4 py-3">
                <span>Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((lead) => (
            <tr key={lead.id} className="hover:bg-surface-subtle">
              {isAdmin && (
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(lead.id)}
                    onChange={() => onToggleLead(lead.id)}
                    aria-label={`Select lead for ${lead.clientName}`}
                    className="h-4 w-4 rounded border-border"
                  />
                </td>
              )}
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 ${column.className ?? ''}`}>
                  <Link href={`/leads/${lead.id}`} className="block">{column.render(lead)}</Link>
                </td>
              ))}
              {isAdmin && isArchivedView && (
                <td className="px-4 py-3">
                  <form action={restoreLeadAction}>
                    <input type="hidden" name="leadId" value={lead.id} />
                    <button
                      type="submit"
                      className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
                    >
                      Restore
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (isAdmin ? 1 : 0) + (isAdmin && isArchivedView ? 1 : 0)}
                className="px-4 py-8 text-center text-text-muted"
              >
                No leads found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableShell>
  )
}

function SortableHeader({ column, prefs, onSort }: { column: ColumnDef; prefs: TablePrefs; onSort: (sortColumn: string) => void }) {
  if (!column.sortKey) return <span>{column.label}</span>

  const active = prefs.sortColumn === column.sortKey
  const marker = active ? (prefs.sortDir === 'asc' ? ' (asc)' : ' (desc)') : ''

  return (
    <button
      type="button"
      onClick={() => onSort(column.sortKey as string)}
      className="text-left text-xs font-semibold uppercase tracking-wide text-text-muted hover:text-text-primary"
    >
      {column.label}{marker}
    </button>
  )
}

function PageSizeSelect({ filters, basePath, paramPrefix }: { filters: LeadsListFilters; basePath: string; paramPrefix: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(size: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(`${paramPrefix}size`, size)
    params.set(`${paramPrefix}page`, '1')
    router.push(`${basePath}?${params}`)
  }

  return (
    <label className="flex items-center gap-2 text-sm text-text-secondary">
      <span className="whitespace-nowrap">Page size</span>
      <select
        value={String(filters.size)}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-[var(--radius-control)] border border-border bg-surface px-2 py-1.5 text-sm text-text-primary"
      >
        {(['5', '10', '20', '50', '100'] as const).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  )
}

function PageLink({ filters, page, disabled, basePath, paramPrefix, children }: { filters: LeadsListFilters; page: number; disabled: boolean; basePath: string; paramPrefix: string; children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const params = new URLSearchParams(searchParams.toString())
  params.set(`${paramPrefix}tier`, filters.tier)
  params.set(`${paramPrefix}sm8`, filters.sm8)
  params.set(`${paramPrefix}date`, filters.date)
  params.set(`${paramPrefix}stale`, String(filters.stale))
  params.set(`${paramPrefix}statusView`, filters.statusView)
  params.set(`${paramPrefix}size`, String(filters.size))
  params.set(`${paramPrefix}q`, filters.q)
  params.set(`${paramPrefix}sortColumn`, filters.sortColumn)
  params.set(`${paramPrefix}sortDir`, filters.sortDir)
  params.set(`${paramPrefix}page`, String(page))

  if (disabled) return <span className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-text-muted opacity-60">{children}</span>
  return <Link href={`${basePath}?${params}`} className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-text-secondary hover:bg-surface-subtle">{children}</Link>
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) {
    return <StatusBadge tone="muted">Needs scoring</StatusBadge>
  }

  const tone = tier === 'A' ? 'positive' : tier === 'B' ? 'info' : tier === 'C' ? 'warning' : 'muted'
  return <StatusBadge tone={tone}>{tier}</StatusBadge>
}

function Sm8Badge({ linked, status }: { linked: boolean; status: string }) {
  if (linked) return <StatusBadge tone="positive">Linked</StatusBadge>
  if (status === 'sync_failed') return <StatusBadge tone="critical">Failed</StatusBadge>
  return <StatusBadge tone="warning">Pending</StatusBadge>
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short' }).format(new Date(date))
}

function formatNullableDate(date: Date | string | null) {
  return date ? formatDate(date) : '-'
}
