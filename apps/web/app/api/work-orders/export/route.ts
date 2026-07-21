import { NextResponse } from 'next/server'
import { rowsToCsv } from '@/lib/audit-export'
import { requireModule } from '@/lib/guard'
import { parseWorkOrderListFilters } from '@/modules/work-orders/list-filters'
import { listWorkOrdersForExport } from '@/modules/work-orders/queries'
import { getWorkOrderSummaryConfig } from '@/modules/work-orders/summary-config'
import { buildWorkOrderExportTable } from '@/modules/work-orders/work-order-export'
import { getWorkOrderSpecificationFilterConfig } from '@/modules/work-orders/specification-filter-config'
import { loadProductionSpecificationCatalogue } from '@/modules/work-orders/production-specification-catalogue'

export async function GET(request: Request) {
  await requireModule('work-orders')

  const url = new URL(request.url)
  try {
    const [specificationFilters, catalogue, fields] = await Promise.all([
      getWorkOrderSpecificationFilterConfig(),
      loadProductionSpecificationCatalogue(),
      getWorkOrderSummaryConfig(),
    ])
    const filters = parseWorkOrderListFilters(Object.fromEntries(url.searchParams.entries()), {
      specificationFields: specificationFilters
        .filter((field) => field.enabled)
        .map((field) => field.field),
    })
    const rows = await listWorkOrdersForExport(filters, catalogue)
    const body = rowsToCsv(buildWorkOrderExportTable(rows, fields, catalogue))

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="work-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.startsWith('Work Order export exceeds')) {
      return NextResponse.json({ error: message }, { status: 413 })
    }
    throw error
  }
}
