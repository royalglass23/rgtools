import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function pageSource() {
  return readFileSync(
    join(process.cwd(), 'app/(dashboard)/work-orders/page.tsx'),
    'utf8',
  )
}

function controlsSource() {
  return readFileSync(
    join(process.cwd(), 'modules/work-orders/WorkOrdersTableControls.tsx'),
    'utf8',
  )
}

describe('work orders server page', () => {
  it('does not pass browser event handlers from the server component tree', () => {
    const source = pageSource()

    expect(source).not.toContain('onChange=')
    expect(source).not.toContain('requestSubmit()')
  })

  it('keeps summary configuration ownership for supplementary parent fields', () => {
    const source = `${pageSource()}\n${controlsSource()}`

    expect(source).toContain('getWorkOrderSummaryConfig')
    expect(source).toContain('<ParentSummaryFields row={row} fields={fields} />')
    expect(source).toContain('field.visible')

    expect(source).not.toContain('>Created<')
    expect(source).not.toContain('>AI suggestion<')
    expect(source).not.toContain('>Client notes<')
    expect(source).not.toContain('>SM8 Status<')
  })

  it('keeps installer visible but out of the default filter bar', () => {
    const source = controlsSource()

    expect(source).toContain('name={`${paramPrefix}q`}')
    expect(source).toContain('name={`${paramPrefix}risk`}')
    expect(source).toContain('name={`${paramPrefix}importance`}')
    expect(source).toContain('name={`${paramPrefix}stage`}')
    expect(source).toContain('name={`${paramPrefix}hardware`}')
    expect(source).toContain('name={`${paramPrefix}maintenanceProgram`}')
    expect(source).not.toContain('name={`${paramPrefix}installer`}')
    expect(source).not.toContain('name={`${paramPrefix}servicem8Status`}')
  })

  it('has distinct empty and no-results copy for the summary table', () => {
    const source = `${pageSource()}\n${controlsSource()}`

    expect(source).toContain('No current Work Orders yet.')
    expect(source).toContain('No Work Orders match these filters.')
    expect(source).toContain('Work Orders could not refresh from ServiceM8')
  })

  it('shows operational controls only for manage users', () => {
    const source = pageSource()

    expect(source).toContain('getCurrentWorkOrderPermissions')
    expect(source).toContain('permissions.canManage &&')
    expect(source).toContain('<WorkOrderRefreshButton />')
  })

  it('offers filtered CSV export without carrying page-only params', () => {
    const source = pageSource()

    expect(source).toContain('/api/work-orders/export?')
    expect(source).toContain('Export CSV')
    expect(source).toContain("if (key === 'page' || key === 'refreshError') continue")
  })

  it('links the grouped job header to Work Order detail without a separate open column', () => {
    const source = controlsSource()

    expect(source).toContain('href={`/work-orders/${row.id}`}')
    expect(source).toContain('aria-label={`Work Order ${workOrderLabel}`}')
    expect(source).not.toContain('<th className="px-4 py-3">Open</th>')
    expect(source).not.toContain('>AI suggestion<')
  })

  it('uses auto-applying filters with reset aligned inline and grouped Work Orders', () => {
    const source = controlsSource()

    expect(source).toContain('event.currentTarget.form?.requestSubmit()')
    expect(source).toContain('xl:grid-cols-[minmax(320px,1.6fr)_repeat(6,minmax(135px,1fr))_auto]')
    expect(source).toContain('aria-label="Work Order filter utilities"')
    expect(source).toContain('role="group"')
    expect(source).not.toContain('min-w-[1280px]')
    expect(source).not.toContain('Apply')
  })
})
