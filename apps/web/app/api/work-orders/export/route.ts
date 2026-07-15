import { NextResponse } from 'next/server'
import { rowsToCsv } from '@/lib/audit-export'
import { requireModule } from '@/lib/guard'
import { parseWorkOrderListFilters } from '@/modules/work-orders/list-filters'
import { listWorkOrdersForExport } from '@/modules/work-orders/queries'
import { getWorkOrderSummaryConfig } from '@/modules/work-orders/summary-config'
import { buildWorkOrderExportTable } from '@/modules/work-orders/work-order-export'

export async function GET(request: Request) {
  await requireModule('work-orders')

  const url = new URL(request.url)
  const filters = parseWorkOrderListFilters(Object.fromEntries(url.searchParams.entries()))
  const [rows, fields] = await Promise.all([
    listWorkOrdersForExport(filters),
    getWorkOrderSummaryConfig(),
  ])
  const body = rowsToCsv(buildWorkOrderExportTable(rows, fields))

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="work-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
