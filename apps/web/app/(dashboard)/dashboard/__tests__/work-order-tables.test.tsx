import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/lib/dashboard-access', () => ({ requireDashboardUser: vi.fn() }))
vi.mock('@/modules/kanban/persistence', () => ({ readWorkOrderDashboard: mocks.read }))
vi.mock('@/modules/kanban/ProductEditor', () => ({ ProductEditor: () => null }))
vi.mock('@/modules/kanban/RefreshControl', () => ({ RefreshControl: () => null }))
vi.mock('@/modules/work-orders/queries', () => ({ getWorkOrderRefreshStatus: async () => ({ lastSuccessfulAt: null, latestFailure: null }) }))
import WorkOrderPage from '../work-orders/page'
import { parseManualState } from '@/modules/kanban/work-orders'
const rows = Array.from({ length: 31 }, (_, index) => ({
  jobId: `job-${index + 1}`, jobNumber: `WO${index + 1}`, customer: `Customer ${index + 1}`, address: `Site ${index + 1}`,
  jobUuid: null, jobInstallDate: null, itemId: `item-${index + 1}`, itemUuid: `source-${index + 1}`, label: `Product ${index + 1}`,
  quantity: '2', installDate: '2026-11-20', focus: 'upcoming',
  manual: parseManualState({ bottleStrut: 'yes', buildingConsent: 'na', clientWaitingFor: 'Confirm delivery' }),
}))
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ rows, installers: [], today: '2026-11-16' }) })
async function show(params: Record<string, string> = {}) { render(await WorkOrderPage({ searchParams: Promise.resolve(params) })) }
const tableA = () => screen.getByRole('region', { name: 'Table A - All Work Orders' }).querySelector('table')!
const tableB = () => screen.getByRole('region', { name: 'Table B - Product planning' }).querySelector('table')!

describe('prototype Work Orders tables and shared pagination', () => {
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
})
