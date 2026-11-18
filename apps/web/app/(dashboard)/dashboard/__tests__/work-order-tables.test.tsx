import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), auth: vi.fn() }))
vi.mock('@/lib/dashboard-access', () => ({ requireDashboardUser: mocks.auth }))
vi.mock('@/modules/kanban/persistence', () => ({ readWorkOrderDashboard: mocks.read }))
import WorkOrderPage from '../work-orders/page'
import { parseManualState } from '@/modules/kanban/work-orders'
const rows = Array.from({ length: 31 }, (_, index) => ({
  jobId: `job-${index + 1}`, jobNumber: `WO${index + 1}`, customer: `Customer ${index + 1}`, address: `Site ${index + 1}`,
  jobUuid: null, jobInstallDate: '2026-11-20', itemId: `item-${index + 1}`, itemUuid: `source-${index + 1}`, label: `Product ${index + 1}`,
  description: `Full source description for product ${index + 1}`, quantity: '2', installDate: '2026-11-20', focus: 'upcoming',
  planningDate: '2026-11-20', inDueWindow: true, dateSource: 'staff', assessment: { state: 'failed', error: 'Old failure' }, assessmentCurrent: false,
  manual: parseManualState({ bottleStrut: 'yes', buildingConsent: 'na', clientWaitingFor: 'Saved waiting value' }),
}))
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ rows, installers: [], today: '2026-11-18', flagsUnavailable: true }) })
async function show(params: Record<string, string> = {}) { render(await WorkOrderPage({ searchParams: Promise.resolve(params) })) }
const tableA = () => screen.getByRole('region', { name: 'All Work Order rows' }).querySelector('table')!
const tableB = () => screen.getByRole('region', { name: 'Due product rows' }).querySelector('table')!

describe('columns-only Work Orders dashboard', () => {
  it('matches both PDF table titles and column sets exactly, keeping all planning cells blank', async () => {
    await show()
    expect(screen.getByRole('heading', { name: 'Table A - Every work order' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Table B - Due within 3 weeks' })).toBeInTheDocument()
    expect(within(tableA()).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?'])
    expect(within(tableB()).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?'])
    for (const row of tableA().querySelectorAll('tbody tr')) {
      const cells = within(row as HTMLElement).getAllByRole('cell')
      expect(cells).toHaveLength(5); cells.slice(3).forEach(cell => expect(cell).toBeEmptyDOMElement())
    }
    for (const row of tableB().querySelectorAll('tbody tr')) {
      const cells = within(row as HTMLElement).getAllByRole('cell')
      expect(cells).toHaveLength(11); cells.slice(2).forEach(cell => expect(cell).toBeEmptyDOMElement())
    }
    expect(screen.queryByText('Saved waiting value')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Refresh|Save product/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Product focus' })).not.toBeInTheDocument()
    expect(document.querySelector('details')).toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('retains source job/material identity and preview, without an editor link', async () => {
    await show()
    expect(within(tableA()).getByText('WO1')).toBeInTheDocument()
    expect(within(tableB()).getByText('WO1 / Customer 1')).toBeInTheDocument()
    fireEvent.pointerEnter(within(tableB()).getByRole('button', { name: 'View material description: Product 1' }))
    expect(screen.getByRole('dialog', { name: 'Materials · WO1' })).toHaveTextContent('Full source description for product 1')
    expect(screen.queryByRole('link', { name: 'Edit product' })).not.toBeInTheDocument()
  })
  it('keeps existing due membership and distinct job rows even with an obsolete focus query', async () => {
    mocks.read.mockResolvedValue({ rows: [rows[0], { ...rows[0], itemId: 'second-product', label: 'Second product', inDueWindow: false }, { ...rows[1], inDueWindow: false }], installers: [] })
    await show({ focus: 'all' })
    expect(tableA().querySelectorAll('tbody tr')).toHaveLength(2)
    expect(tableB().querySelectorAll('tbody tr')).toHaveLength(1)
    expect(within(tableB()).queryByText('Second product')).not.toBeInTheDocument()
  })
  it('uses independent five-row defaults and 5/10/20/50 size controls', async () => {
    await show()
    expect(tableA().querySelectorAll('tbody tr')).toHaveLength(5)
    expect(tableB().querySelectorAll('tbody tr')).toHaveLength(5)
    for (const size of screen.getAllByRole('combobox', { name: 'Page size' })) {
      expect(size).toHaveValue('5')
      expect(within(size).getAllByRole('option').map(el => el.textContent)).toEqual(['5', '10', '20', '50'])
    }
    expect(screen.getByRole('navigation', { name: 'Work Order pages' })).toHaveTextContent('Page 1 of 7')
    expect(screen.getByRole('navigation', { name: 'Product pages' })).toHaveTextContent('Page 1 of 7')
  })
  it('preserves the other table and search while navigating or changing page size', async () => {
    await show({ jobsPage: '2', jobsSize: '10', itemsPage: '3', itemsSize: '5', q: 'site' })
    expect(within(tableA()).getByText('WO18')).toBeInTheDocument()
    expect(within(tableB()).getByText('Product 11')).toBeInTheDocument()
    const next = within(screen.getByRole('navigation', { name: 'Work Order pages' })).getByRole('link', { name: 'Next' })
    expect(Object.fromEntries(new URL(next.getAttribute('href')!, 'http://localhost').searchParams)).toEqual({ q: 'site', jobsPage: '3', jobsSize: '10', itemsPage: '3', itemsSize: '5' })
    const fields = new FormData(screen.getAllByRole('combobox', { name: 'Page size' })[0].closest('form')!)
    expect(fields.get('jobsPage')).toBe('1'); expect(fields.get('itemsPage')).toBe('3'); expect(fields.get('q')).toBe('site')
  })
  it.each(['query', 'page size'])('resynchronizes committed %s controls', async field => {
    const view = render(await WorkOrderPage({ searchParams: Promise.resolve({ q: 'old query', itemsSize: '10' }) }))
    const control = field === 'query' ? screen.getByRole('searchbox') : screen.getAllByRole('combobox', { name: 'Page size' })[1]
    fireEvent.change(control, { target: { value: field === 'query' ? 'Typed query' : '20' } })
    view.rerender(await WorkOrderPage({ searchParams: Promise.resolve({ itemsSize: '5' }) }))
    expect(field === 'query' ? screen.getByRole('searchbox') : screen.getAllByRole('combobox', { name: 'Page size' })[1]).toHaveValue(field === 'query' ? '' : '5')
  })
  it('passes search to the existing read model and retains both table schemas when empty', async () => {
    mocks.read.mockResolvedValue({ rows: [], installers: [] })
    await show({ q: ' WO1 ', jobsPage: '999', jobsSize: '999', itemsPage: '-1' })
    expect(mocks.auth).toHaveBeenCalledOnce(); expect(mocks.read).toHaveBeenCalledWith('WO1')
    expect(screen.getAllByRole('table')).toHaveLength(2)
    expect(screen.getAllByText('Page 1 of 1')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Clear search' })).toHaveAttribute('href', '/dashboard/work-orders')
  })
  it('keeps the authenticated load-error state', async () => {
    mocks.read.mockRejectedValue(new Error('Unavailable'))
    await show()
    expect(mocks.auth).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('Work Order records could not load')
  })
})
