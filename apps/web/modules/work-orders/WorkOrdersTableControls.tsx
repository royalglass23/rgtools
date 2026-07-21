'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { batchDeleteWorkOrdersAction } from './actions'
import type { WorkOrderListFilters } from './list-filters'
import type { WorkOrderRow } from './queries'
import type { WorkOrderSummaryFieldConfig } from './summary-config'
import { WorkOrderItemsSummary } from './WorkOrderItemsSummary'

type FilterOption = { id: string; label: string }

type WorkOrderFilterOptions = {
  installers: FilterOption[]
  stages: FilterOption[]
  hardwareStatuses: FilterOption[]
}

export function WorkOrdersTableControls({
  rows,
  filters,
  fields,
  options,
  total,
  pageCount,
  basePath = '/work-orders',
  paramPrefix = '',
  isAdmin = false,
  canManage = false,
}: {
  rows: WorkOrderRow[]
  filters: WorkOrderListFilters
  fields: WorkOrderSummaryFieldConfig[]
  options: WorkOrderFilterOptions
  total: number
  pageCount: number
  basePath?: string
  paramPrefix?: string
  isAdmin?: boolean
  canManage?: boolean
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedSet.has(row.id))

  function toggleWorkOrder(workOrderId: string) {
    setSelectedIds((current) => (
      current.includes(workOrderId)
        ? current.filter((id) => id !== workOrderId)
        : [...current, workOrderId]
    ))
  }

  function toggleAllVisible() {
    setSelectedIds(allVisibleSelected ? [] : rows.map((row) => row.id))
  }

  return (
    <>
      <WorkOrderFilters
        filters={filters}
        options={options}
        fields={fields}
        basePath={basePath}
        paramPrefix={paramPrefix}
      />
      {isAdmin && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{selectedIds.length} selected</span>
          <button
            type="submit"
            form="batch-delete-work-orders-form"
            disabled={selectedIds.length === 0}
            className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete selected
          </button>
        </div>
      )}

      {isAdmin && (
        <form
          id="batch-delete-work-orders-form"
          action={batchDeleteWorkOrdersAction}
          onSubmit={(event) => {
            if (selectedIds.length === 0) {
              event.preventDefault()
              return
            }

            if (!window.confirm(`Delete ${selectedIds.length} selected Work Order${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`)) {
              event.preventDefault()
            }
          }}
        >
          {selectedIds.map((workOrderId) => (
            <input key={workOrderId} type="hidden" name="workOrderId" value={workOrderId} />
          ))}
        </form>
      )}

      <WorkOrdersTable
        key={JSON.stringify(filters)}
        rows={rows}
        filters={filters}
        fields={fields}
        options={options}
        isAdmin={isAdmin}
        canManage={canManage}
        selectedSet={selectedSet}
        allVisibleSelected={allVisibleSelected}
        onToggleWorkOrder={toggleWorkOrder}
        onToggleAllVisible={toggleAllVisible}
      />

      <div className="grid grid-cols-1 items-center gap-3 text-sm text-gray-600 md:grid-cols-3">
        <span>{total} work orders</span>
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

function WorkOrderFilters({
  filters,
  options,
  fields,
  basePath,
  paramPrefix,
}: {
  filters: WorkOrderListFilters
  options: WorkOrderFilterOptions
  fields: WorkOrderSummaryFieldConfig[]
  basePath: string
  paramPrefix: string
}) {
  const searchParams = useSearchParams()
  const owned = new Set(['q', 'current', 'risk', 'importance', 'stage', 'hardware', 'maintenanceProgram', 'showRemovedItems', 'sort', 'size', 'page'].map((name) => `${paramPrefix}${name}`))
  const carryOver = Array.from(searchParams.entries()).filter(([key]) => !owned.has(key))
  const resetParams = new URLSearchParams(carryOver)
  resetParams.set(`${paramPrefix}size`, String(filters.size))
  resetParams.set(`${paramPrefix}page`, '1')
  const resetHref = resetParams.toString() ? `${basePath}?${resetParams}` : basePath
  const filterable = new Set(fields.filter((field) => field.filterable).map((field) => field.id))

  return (
    <form action={basePath} className="grid items-end gap-3 rounded border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-[minmax(320px,1.6fr)_repeat(6,minmax(135px,1fr))_auto]">
      {carryOver.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <input type="hidden" name={`${paramPrefix}page`} value="1" />
      <input type="hidden" name={`${paramPrefix}size`} value={String(filters.size)} />
      <div className="block">
        <label htmlFor={`${paramPrefix}work-order-search`} className="text-xs font-medium text-gray-600">Search</label>
        <div className="mt-1 flex gap-2">
          <input
            id={`${paramPrefix}work-order-search`}
            name={`${paramPrefix}q`}
            defaultValue={filters.q}
            placeholder="Client, address, job number, item"
            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950"
          />
          <button type="submit" className="rounded bg-[#142B3A] px-3 py-2 text-sm font-medium text-white hover:bg-[#1d3d52]">
            Search
          </button>
        </div>
      </div>
      {filterable.has('importance') && <Select name={`${paramPrefix}importance`} label="Importance" value={filters.importance} options={[['all', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />}
      {filterable.has('risk') && <Select name={`${paramPrefix}risk`} label="Risk" value={filters.risk} options={[['all', 'All'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />}
      {filterable.has('stage') && <Select name={`${paramPrefix}stage`} label="Stage" value={filters.stage} options={[['all', 'All'], ...options.stages.map((option) => [option.id, option.label] as [string, string])]} />}
      {filterable.has('hardware') && <Select name={`${paramPrefix}hardware`} label="Hardware" value={filters.hardware} options={[['all', 'All'], ...options.hardwareStatuses.map((option) => [option.id, option.label] as [string, string])]} />}
      {filterable.has('maintenanceProgram') && <Select name={`${paramPrefix}maintenanceProgram`} label="Maintenance Program" value={filters.maintenanceProgram} options={[['all', 'All'], ['yes', 'Yes'], ['no', 'No']]} />}
      <Select
        name={`${paramPrefix}sort`}
        label="Sort"
        value={filters.sort}
        options={[
          ['lead_score_desc', 'Lead score high-low'],
          ['lead_score_asc', 'Lead score low-high'],
          ['importance_desc', 'Importance high-low'],
          ['importance_asc', 'Importance low-high'],
          ['risk_desc', 'Risk high-low'],
          ['risk_asc', 'Risk low-high'],
          ['install_date_asc', 'Install date asc'],
          ['install_date_desc', 'Install date desc'],
          ['client_asc', 'Client A-Z'],
          ['client_desc', 'Client Z-A'],
          ['job_number_asc', 'Job number asc'],
          ['job_number_desc', 'Job number desc'],
        ]}
      />
      <div
        role="group"
        aria-label="Work Order filter utilities"
        className="flex items-center justify-end gap-3 xl:col-start-8"
      >
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-gray-700">
          <input
            type="checkbox"
            name={`${paramPrefix}showRemovedItems`}
            value="1"
            defaultChecked={filters.showRemovedItems}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="h-4 w-4 rounded border-gray-300"
          />
          Show removed items
        </label>
        <Link href={resetHref} className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Reset
        </Link>
      </div>
    </form>
  )
}

function WorkOrdersTable({
  rows,
  filters,
  fields,
  options,
  isAdmin,
  canManage,
  selectedSet,
  allVisibleSelected,
  onToggleWorkOrder,
  onToggleAllVisible,
}: {
  rows: WorkOrderRow[]
  filters: WorkOrderListFilters
  fields: WorkOrderSummaryFieldConfig[]
  options: WorkOrderFilterOptions
  isAdmin: boolean
  canManage: boolean
  selectedSet: Set<string>
  allVisibleSelected: boolean
  onToggleWorkOrder: (workOrderId: string) => void
  onToggleAllVisible: () => void
}) {
  const [collapsedWorkOrderIds, setCollapsedWorkOrderIds] = useState<string[]>([])
  const emptyMessage = hasActiveListFilters(filters)
    ? 'No Work Orders match these filters.'
    : 'No current Work Orders yet.'

  function toggleExpanded(workOrderId: string) {
    setCollapsedWorkOrderIds((current) => (
      current.includes(workOrderId)
        ? current.filter((id) => id !== workOrderId)
        : [...current, workOrderId]
    ))
  }

  return (
    <div className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
      {isAdmin && rows.length > 0 && (
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={onToggleAllVisible}
              aria-label="Select all visible Work Orders"
              className="h-4 w-4 rounded border-gray-300"
            />
            Select all visible Work Orders
          </label>
        </div>
      )}

      <div className="divide-y divide-gray-200">
        {rows.map((row, rowIndex) => {
          const isExpanded = !collapsedWorkOrderIds.includes(row.id)
          const workOrderLabel = row.jobNumber ?? row.id
          const jobTone = rowIndex % 2 === 0 ? 'white' : 'tint'
          const jobHeaderTone = jobTone === 'tint' ? 'bg-[#E8EEF1]' : 'bg-white'

          return (
            <section key={row.id} role="group" aria-label={`Work Order ${workOrderLabel}`}>
              <div className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${jobHeaderTone}`}>
                <div className="flex min-w-0 items-start gap-3">
                  {isAdmin && (
                    <input
                      type="checkbox"
                      checked={selectedSet.has(row.id)}
                      onChange={() => onToggleWorkOrder(row.id)}
                      aria-label={`Select Work Order for ${row.clientName}`}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                  )}
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} Work Order ${workOrderLabel}`}
                    onClick={() => toggleExpanded(row.id)}
                    className="mt-0.5 rounded p-1 text-gray-600 hover:bg-gray-200 hover:text-gray-950 focus:outline-none focus:ring-2 focus:ring-[#142B3A]"
                  >
                    <span aria-hidden="true">{isExpanded ? '⌄' : '›'}</span>
                  </button>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link href={`/work-orders/${row.id}`} className="font-semibold text-gray-950 hover:underline">
                        {row.jobNumber ?? 'No job number'}
                      </Link>
                      <span className="font-medium text-gray-800">{row.clientName}</span>
                      <span className="rounded bg-white px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                        {row.matchingActiveItemCount === null || row.matchingActiveItemCount === undefined
                          ? `${row.activeItemCount} active ${row.activeItemCount === 1 ? 'item' : 'items'}`
                          : `${row.matchingActiveItemCount} of ${row.activeItemCount} active ${row.activeItemCount === 1 ? 'item' : 'items'}`}
                      </span>
                      <span className="rounded bg-white px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                        Lead Score {row.leadScore ?? 'Not scored'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{row.jobAddress ?? 'No job address'}</p>
                  </div>
                </div>
                <ParentSummaryFields row={row} fields={fields} />
              </div>

              {isExpanded && (
                <WorkOrderItemsSummary
                  items={row.items}
                  options={options}
                  showCount={false}
                  canManage={canManage}
                  fields={fields}
                  tone={jobTone}
                />
              )}
            </section>
          )
        })}
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-500">{emptyMessage}</p>
        )}
      </div>
    </div>
  )
}

function ParentSummaryFields({ row, fields }: { row: WorkOrderRow; fields: WorkOrderSummaryFieldConfig[] }) {
  const parentContextFields = new Set(['client', 'jobNumber', 'jobAddress', 'leadScore', 'item'])
  const itemOperationalFields = new Set([
    'importance',
    'risk',
    'installer',
    'stage',
    'hardware',
    'maintenanceProgram',
    'installDate',
    'dateCompleted',
  ])
  const supplementaryFields = fields.filter((field) => (
    field.visible
    && !parentContextFields.has(field.id)
    && !itemOperationalFields.has(field.id)
  ))
  if (supplementaryFields.length === 0) return null

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
      {supplementaryFields.map((field) => (
        <div key={field.id}>
          <dt className="text-gray-500">{field.label}</dt>
          <dd className="font-medium text-gray-800">{summaryValue(field.id, row)}</dd>
        </div>
      ))}
    </dl>
  )
}

function summaryValue(fieldId: WorkOrderSummaryFieldConfig['id'], row: WorkOrderRow) {
  if (fieldId === 'importance') return row.importance ? titleCase(row.importance) : '-'
  if (fieldId === 'risk') return row.riskLevel ? titleCase(row.riskLevel) : '-'
  const values: Record<WorkOrderSummaryFieldConfig['id'], string | number | null> = {
    client: row.clientName,
    jobNumber: row.jobNumber,
    jobAddress: row.jobAddress,
    leadScore: row.leadScore,
    item: null,
    importance: row.importance,
    risk: row.riskLevel,
    installer: row.installerName,
    stage: row.stageName,
    hardware: row.hardwareStatusName,
    maintenanceProgram: row.maintenanceProgram ? 'Yes' : 'No',
    installDate: formatNullableDate(row.installDate),
    dateCompleted: formatNullableDate(row.dateCompleted),
    servicem8Status: row.servicem8Status,
    jobDescription: row.jobDescription,
  }
  return values[fieldId] ?? '-'
}

function hasActiveListFilters(filters: WorkOrderListFilters) {
  return Boolean(filters.q)
    || filters.risk !== 'all'
    || filters.importance !== 'all'
    || filters.stage !== 'all'
    || filters.hardware !== 'all'
    || filters.maintenanceProgram !== 'all'
    || filters.showRemovedItems
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: Array<[string, string]> }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <select
        aria-label={label}
        name={name}
        defaultValue={value}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950"
      >
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  )
}

function PageLink({
  filters,
  page,
  disabled,
  basePath,
  paramPrefix,
  children,
}: {
  filters: WorkOrderListFilters
  page: number
  disabled: boolean
  basePath: string
  paramPrefix: string
  children: React.ReactNode
}) {
  if (disabled) return <span className="rounded border border-gray-200 px-3 py-1.5 text-gray-400">{children}</span>
  const params = paramsFor(filters, paramPrefix)
  params.set(`${paramPrefix}page`, String(page))
  return <Link href={`${basePath}?${params}`} className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50">{children}</Link>
}

function PageSizeSelect({ filters, basePath, paramPrefix }: { filters: WorkOrderListFilters; basePath: string; paramPrefix: string }) {
  return (
    <form action={basePath} className="flex items-center gap-2">
      {Array.from(paramsFor(filters, paramPrefix).entries())
        .filter(([key]) => key !== `${paramPrefix}size` && key !== `${paramPrefix}page`)
        .map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <input type="hidden" name={`${paramPrefix}page`} value="1" />
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <span className="whitespace-nowrap">Page size</span>
        <select
          aria-label="Page size"
          name={`${paramPrefix}size`}
          defaultValue={String(filters.size)}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-950"
        >
          {(['5', '10', '20', '50'] as const).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </form>
  )
}

function paramsFor(filters: WorkOrderListFilters, paramPrefix: string, searchParams?: ReturnType<typeof useSearchParams>) {
  const params = new URLSearchParams()
  if (searchParams) {
    const owned = new Set(['q', 'current', 'risk', 'importance', 'stage', 'hardware', 'maintenanceProgram', 'showRemovedItems', 'sort', 'size', 'page'].map((name) => `${paramPrefix}${name}`))
    for (const [key, value] of searchParams.entries()) {
      if (!owned.has(key)) params.append(key, value)
    }
  }
  if (filters.q) params.set(`${paramPrefix}q`, filters.q)
  params.set(`${paramPrefix}current`, filters.current)
  params.set(`${paramPrefix}risk`, filters.risk)
  params.set(`${paramPrefix}importance`, filters.importance)
  params.set(`${paramPrefix}stage`, filters.stage)
  params.set(`${paramPrefix}hardware`, filters.hardware)
  params.set(`${paramPrefix}maintenanceProgram`, filters.maintenanceProgram)
  if (filters.showRemovedItems) params.set(`${paramPrefix}showRemovedItems`, '1')
  params.set(`${paramPrefix}sort`, filters.sort)
  params.set(`${paramPrefix}size`, String(filters.size))
  params.set(`${paramPrefix}page`, String(filters.page))
  return params
}

function formatNullableDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
