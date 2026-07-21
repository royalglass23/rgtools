/**
 * Server-side registry mapping each dashboard table to the existing entity table
 * (its query + parser + controls component). Imported only by server code.
 */
import type { ReactNode } from 'react'
import { getLeadsList, parseLeadsListFilters } from '@/modules/leads/queries'
import { LeadsTableControls } from '@/modules/leads/LeadsTableControls'
import { listQuotes } from '@/modules/quote-tracker/queries'
import { parseQuoteListFilters } from '@/modules/quote-tracker/list-filters'
import { QuoteTableControls } from '@/modules/quote-tracker/QuoteTableControls'
import { parseWorkOrderListFilters } from '@/modules/work-orders/list-filters'
import { getWorkOrderFilterOptions, listWorkOrders } from '@/modules/work-orders/queries'
import { getWorkOrderSummaryConfig } from '@/modules/work-orders/summary-config'
import { WorkOrdersTableControls } from '@/modules/work-orders/WorkOrdersTableControls'
import { getTableMeta, type DashboardTableKey } from './tables'

type RenderArgs = {
  searchParams: Record<string, string | string[] | undefined>
  /** Admin-set default filter for this table. */
  filter: Record<string, string>
  isAdmin: boolean
}

type ServerTable = {
  render: (args: RenderArgs) => Promise<ReactNode>
}

const leadsTable: ServerTable = {
  async render({ searchParams, filter, isAdmin }) {
    const meta = getTableMeta('leads')!
    const filters = parseLeadsListFilters(searchParams, {
      prefix: meta.paramPrefix,
      defaults: filter,
    })
    const { rows, total, pageCount } = await getLeadsList(filters)

    return (
      <LeadsTableControls
        filters={filters}
        rows={rows}
        total={total}
        pageCount={pageCount}
        isAdmin={isAdmin}
        basePath="/"
        paramPrefix={meta.paramPrefix}
      />
    )
  },
}

const quotesTable: ServerTable = {
  async render({ searchParams, filter, isAdmin }) {
    const meta = getTableMeta('quotes')!
    const filters = parseQuoteListFilters(searchParams, {
      prefix: meta.paramPrefix,
      defaults: filter,
    })
    const { rows, total, pageCount } = await listQuotes(filters)

    return (
      <QuoteTableControls
        filters={filters}
        rows={rows}
        total={total}
        pageCount={pageCount}
        basePath="/"
        paramPrefix={meta.paramPrefix}
        isAdmin={isAdmin}
      />
    )
  },
}

const workOrdersTable: ServerTable = {
  async render({ searchParams, filter, isAdmin }) {
    const meta = getTableMeta('work_orders')!
    const filters = parseWorkOrderListFilters(searchParams, {
      prefix: meta.paramPrefix,
      defaults: filter,
    })
    const [{ rows, total, pageCount }, options, fields] = await Promise.all([
      listWorkOrders(filters),
      getWorkOrderFilterOptions(),
      getWorkOrderSummaryConfig(),
    ])

    return (
      <WorkOrdersTableControls
        rows={rows}
        filters={filters}
        fields={fields}
        options={options}
        total={total}
        pageCount={pageCount}
        basePath="/"
        paramPrefix={meta.paramPrefix}
        isAdmin={isAdmin}
      />
    )
  },
}

/** Only available tables are registered here. */
export const SERVER_TABLES: Partial<Record<DashboardTableKey, ServerTable>> = {
  leads: leadsTable,
  quotes: quotesTable,
  work_orders: workOrdersTable,
}
