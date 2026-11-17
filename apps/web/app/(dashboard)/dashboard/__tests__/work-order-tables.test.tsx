import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/lib/dashboard-access', () => ({ requireDashboardUser: vi.fn() }))
vi.mock('@/modules/kanban/persistence', () => ({ readWorkOrderDashboard: mocks.read }))
vi.mock('@/modules/kanban/ProductEditor', () => ({ ProductEditor: () => null }))
vi.mock('@/modules/kanban/RefreshControl', () => ({ RefreshControl: () => null }))
vi.mock('@/modules/work-orders/queries', () => ({ getWorkOrderRefreshStatus: async () => ({ lastSuccessfulAt: null, latestFailure: null }) }))
import WorkOrderPage from '../work-orders/page'
import { parseManualState } from '@/modules/kanban/work-orders'
import { effectiveProduct } from '@/modules/kanban/__tests__/effective-fixtures'
const rows = Array.from({ length: 31 }, (_, index) => ({
  jobId: `job-${index + 1}`, jobNumber: `WO${index + 1}`, customer: `Customer ${index + 1}`, address: `Site ${index + 1}`,
  jobUuid: null, jobInstallDate: null, itemId: `item-${index + 1}`, itemUuid: `source-${index + 1}`, label: `Product ${index + 1}`,
  quantity: '2', installDate: '2026-11-20', focus: 'upcoming',
  planningDate: '2026-11-20', inDueWindow: true, dateSource: 'staff', assessment: null, assessmentCurrent: false,
  manual: parseManualState({ bottleStrut: 'yes', buildingConsent: 'na', clientWaitingFor: 'Confirm delivery' }),
}))
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ rows, installers: [], today: '2026-11-16' }) })
async function show(params: Record<string, string> = {}) { render(await WorkOrderPage({ searchParams: Promise.resolve(params) })) }
const tableA = () => screen.getByRole('region', { name: 'Table A - All Work Orders' }).querySelector('table')!
const tableB = () => screen.getByRole('region', { name: 'Table B - Product planning' }).querySelector('table')!

describe('prototype Work Orders tables and shared pagination', () => {
  it.each(['query', 'page size'])('resynchronizes the %s control after committed filter parameters change', async field => {
    const view = render(await WorkOrderPage({ searchParams: Promise.resolve({ q: 'old query', focus: 'all', itemsSize: '10' }) }))
    const query = screen.getByRole('searchbox'), size = screen.getAllByRole('combobox', { name: 'Page size' })[1]
    if (field === 'query') fireEvent.change(query, { target: { value: 'Typed draft query' } })
    else fireEvent.change(size, { target: { value: '20' } })
    view.rerender(await WorkOrderPage({ searchParams: Promise.resolve({ focus: 'all', itemsSize: '5' }) }))
    expect(field === 'query' ? screen.getByRole('searchbox') : screen.getAllByRole('combobox', { name: 'Page size' })[1]).toHaveValue(field === 'query' ? '' : '5')
  })
  it('renders the same current automatic fields and literal consent status/reference while another product protects its staff clear', async () => {
    const automatic = effectiveProduct(), staff = effectiveProduct()
    staff.itemId = 'staff-product'; staff.ownership.siteReady = 'staff'; staff.manual.siteReady = 'unknown'
    mocks.read.mockResolvedValue({ rows: [automatic, staff], installers: [{ id: '40600000-0000-4000-8000-000000000030', name: 'Synthetic Installer' }], today: '2026-11-18' })
    await show({ focus: 'all' })
    const productRows = tableB().querySelectorAll('tbody > tr:not([class])')
    const cells = within(productRows[0] as HTMLElement).getAllByRole('cell')
    expect(cells[3]).toHaveTextContent('Y'); expect(cells[3]).toHaveTextContent('Ready on: 18/11/2026')
    expect(cells[4]).toHaveTextContent('Expected: 21/11/2026')
    expect(cells[9]).toHaveTextContent('approved'); expect(cells[9]).toHaveTextContent('BCO1234567')
    expect(cells[1]).toHaveTextContent('Synthetic Installer · suggestion only'); expect(cells[1]).toHaveTextContent('2.5 h')
    expect(within(cells[3]).getByText('Auto · Supported', { exact: true })).not.toBeVisible()
    const staffSite = within(productRows[1] as HTMLElement).getAllByRole('cell')[3]
    expect(within(staffSite).getByText('Unknown', { exact: true })).toBeVisible()
    expect(staffSite.querySelector('summary')).toHaveTextContent(/^Details$/)
    expect(within(staffSite).getByText('Staff · Protected', { exact: true })).not.toBeVisible()
  })
  it('matches both prototype column sets in order, including Bottle strut and BC', async () => {
    await show()
    expect(within(tableA()).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?'])
    expect(within(tableB()).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?'])
    const firstProduct = tableB().querySelector('tbody > tr')!
    const cells = within(firstProduct as HTMLElement).getAllByRole('cell')
    expect(cells[8]).toHaveTextContent('Y'); expect(cells[9]).toHaveTextContent('N/A')
    expect(cells[2]).toHaveTextContent('Confirm delivery')
  })
  it('uses the existing five-row default and 5/10/20/50 page size controls for both tables', async () => {
    await show()
    expect(within(tableA()).queryByText('WO6')).not.toBeInTheDocument()
    expect(within(tableB()).queryByText('Product 6')).not.toBeInTheDocument()
    for (const size of screen.getAllByRole('combobox', { name: 'Page size' })) {
      expect(size).toHaveValue('5')
      expect(within(size).getAllByRole('option').map(el => el.textContent)).toEqual(['5', '10', '20', '50'])
      expect(size.closest('form')).toHaveTextContent('Apply')
    }
    expect(screen.getByRole('navigation', { name: 'Work Order pages' })).toHaveTextContent('Page 1 of 7')
    expect(screen.getByRole('navigation', { name: 'Product pages' })).toHaveTextContent('Page 1 of 7')
  })
  it('paginates independently and preserves the other table and search when navigating or changing size', async () => {
    await show({ jobsPage: '2', jobsSize: '10', itemsPage: '3', itemsSize: '5', q: 'site', focus: 'all' })
    expect(within(tableA()).getByText('WO18')).toBeInTheDocument()
    expect(within(tableB()).queryByText('Product 18')).not.toBeInTheDocument()
    expect(within(tableB()).getByText('Product 11')).toBeInTheDocument()
    const next = within(screen.getByRole('navigation', { name: 'Work Order pages' })).getByRole('link', { name: 'Next' })
    const url = new URL(next.getAttribute('href')!, 'http://localhost')
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'site', focus: 'all', jobsPage: '3', jobsSize: '10', itemsPage: '3', itemsSize: '5' })
    const jobSize = screen.getAllByRole('combobox', { name: 'Page size' })[0]
    const fields = new FormData(jobSize.closest('form')!)
    expect(fields.get('jobsPage')).toBe('1'); expect(fields.get('itemsPage')).toBe('3'); expect(fields.get('q')).toBe('site')
  })
  it('opens a product on its correct page without locking subsequent pagination to that product', async () => {
    await show({ product: 'item-12' })
    expect(document.getElementById('product-item-12')).toHaveAttribute('open')
    const nav = screen.getByRole('navigation', { name: 'Product pages' })
    expect(nav).toHaveTextContent('Page 3 of 7')
    expect(within(nav).getByRole('link', { name: 'Next' }).getAttribute('href')).not.toContain('product=')
  })
  it('clamps invalid or out-of-range pagination and keeps empty lists on page one', async () => {
    mocks.read.mockResolvedValue({ rows: [], installers: [], today: '2026-11-16' })
    await show({ jobsPage: '999', jobsSize: '999', itemsPage: '-1', focus: 'constructor' })
    expect(screen.getAllByText('Page 1 of 1')).toHaveLength(2)
    expect(screen.getAllByRole('combobox', { name: 'Page size' })[0]).toHaveValue('5')
    expect(within(screen.getByRole('navigation', { name: 'Product pages' })).queryByRole('link')).not.toBeInTheDocument()
  })
  it('explains an empty due view when saved products have no dates or manual inclusion', async () => {
    mocks.read.mockResolvedValue({ rows: rows.map(row => ({ ...row, installDate: null, planningDate: null, inDueWindow: false, focus: 'unknown' })), installers: [], today: '2026-11-16' })
    await show()
    expect(screen.getByText(/31 products have no target date or confirmed inclusion/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review products with unknown dates' })).toHaveAttribute('href', expect.stringContaining('focus=unknown'))
    expect(within(screen.getByRole('navigation', { name: 'Product focus' })).getByRole('link', { name: 'Due within 3 weeks' })).toHaveAttribute('aria-current', 'page')
  })
  it('shows Review for unresolved automatic evidence while preserving explicit manual exclusion', async () => {
    mocks.read.mockResolvedValue({ rows: [
      { ...rows[0], focus: 'conflict', inDueWindow: false, planningDate: null },
      { ...rows[1], focus: 'conflict', inDueWindow: false, manual: parseManualState({ focus: 'exclude' }) },
    ], installers: [], today: '2026-11-16' })
    await show({ focus: 'all' })
    const jobRows = within(tableA()).getAllByRole('row').slice(1)
    expect(within(jobRows[0]).getAllByRole('cell').at(-1)).toHaveTextContent('Review')
    expect(within(jobRows[1]).getAllByRole('cell').at(-1)).toHaveTextContent('N')
  })
  it('explains assessment failures above an empty due view instead of presenting them only as unknown dates', async () => {
    mocks.read.mockResolvedValue({ rows: rows.slice(0, 2).map(row => ({ ...row, installDate: null, planningDate: null, inDueWindow: false, focus: 'unknown', assessment: { state: 'failed', result: null, error: 'AI date assessment timed out.' } })), installers: [], today: '2026-11-17' })
    await show()
    expect(screen.getByRole('alert')).toHaveTextContent('Due-date assessment failed for 2 products')
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh from ServiceM8')
  })
})
