import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), auth: vi.fn() }))
vi.mock('@/lib/dashboard-access', () => ({ requireDashboardUser: mocks.auth }))
vi.mock('@/modules/kanban/persistence', () => ({ readWorkOrderDashboard: mocks.read }))
import WorkOrderPage from '../work-orders/page'

beforeEach(() => { vi.resetAllMocks() })
async function show(params: Record<string, string> = {}) { render(await WorkOrderPage({ searchParams: Promise.resolve(params) })) }

describe('temporarily empty Work Orders tables', () => {
  it('retains the exact two column sets with no displayed records or record lookup', async () => {
    await show()
    const tables = screen.getAllByRole('table')
    expect(within(tables[0]).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?'])
    expect(within(tables[1]).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?'])
    tables.forEach(table => expect(table.querySelectorAll('tbody tr')).toHaveLength(0))
    expect(screen.getAllByText('No rows to display.')).toHaveLength(2)
    expect(mocks.auth).toHaveBeenCalledOnce()
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('retains search and independent page-size controls while empty', async () => {
    await show({ q: ' WO1 ', jobsPage: '99', jobsSize: '10', itemsPage: '99', itemsSize: '20' })
    expect(screen.getByRole('searchbox')).toHaveValue('WO1')
    const sizes = screen.getAllByRole('combobox', { name: 'Page size' })
    expect(sizes[0]).toHaveValue('10'); expect(sizes[1]).toHaveValue('20')
    for (const size of sizes) expect(within(size).getAllByRole('option').map(el => el.textContent)).toEqual(['5', '10', '20', '50'])
    expect(screen.getAllByText('Page 1 of 1')).toHaveLength(2)
    const fields = new FormData(sizes[0].closest('form')!)
    expect(fields.get('q')).toBe('WO1'); expect(fields.get('itemsSize')).toBe('20')
    expect(screen.getByRole('link', { name: 'Clear search' })).toHaveAttribute('href', '/dashboard/work-orders')
  })
  it.each(['query', 'page size'])('resynchronizes the committed %s control', async field => {
    const view = render(await WorkOrderPage({ searchParams: Promise.resolve({ q: 'old query', itemsSize: '10' }) }))
    const control = field === 'query' ? screen.getByRole('searchbox') : screen.getAllByRole('combobox', { name: 'Page size' })[1]
    fireEvent.change(control, { target: { value: field === 'query' ? 'Typed query' : '20' } })
    view.rerender(await WorkOrderPage({ searchParams: Promise.resolve({ itemsSize: '5' }) }))
    expect(field === 'query' ? screen.getByRole('searchbox') : screen.getAllByRole('combobox', { name: 'Page size' })[1]).toHaveValue(field === 'query' ? '' : '5')
  })
})
