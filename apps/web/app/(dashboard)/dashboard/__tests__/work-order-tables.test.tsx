import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), history: vi.fn(), changes: vi.fn(), auth: vi.fn(), start: vi.fn(), version: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/dashboard-access', () => ({ requireDashboardUser: mocks.auth }))
vi.mock('@/modules/kanban/publication-store', () => ({ readLatestPublication: mocks.read, readPublicationHistory: mocks.history, readPublicationChanges: mocks.changes }))
vi.mock('@/modules/kanban/bot-refresh', () => ({ startPublishedRefresh: mocks.start, currentPublicationVersion: mocks.version }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
import WorkOrderPage from '../work-orders/page'

const data = () => ({ jobs: Array.from({ length: 12 }, (_, i) => ({ key: `a${i}`, cells: [`R26${i}`, `Fictional ${i}`, `Example Road ${i}`, 'TBC', i === 0 ? 'N' : 'Y'] })), products: Array.from({ length: 7 }, (_, i) => ({ key: `b${i}`, cells: [`R26${i} / Fictional ${i}\nExample Road ${i}`, `Shower ${i}`, 'waiting for sample', '', '?', 'N', 'Y', 'PS1 pending', 'N', 'pending', '?'] })) })
const snapshot = (rows = data()) => ({ version: 1, receivedAt: '2026-11-20T00:02:00.000Z', publication: { publicationId: '12345678-1234-4123-8123-123456789abc', sourceAsOf: '2026-11-20T00:00:00.000Z', tables: { jobs: rows.jobs.map(row => ({ id: row.key, cells: row.cells })), products: rows.products.map(row => ({ id: row.key, cells: row.cells })) } } })
beforeEach(() => { vi.resetAllMocks(); mocks.read.mockResolvedValue(snapshot()); mocks.history.mockResolvedValue({ events: [], hasNext: false }) })
async function show(params: Record<string, string> = {}) { render(await WorkOrderPage({ searchParams: Promise.resolve(params) })) }

describe('published Work Orders tables', () => {
  it('requires sign-in before reading snapshots or publication history', async () => {
    mocks.auth.mockRejectedValue(new Error('sign in'))
    await expect(show()).rejects.toThrow('sign in'); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.history).not.toHaveBeenCalled(); expect(mocks.changes).not.toHaveBeenCalled()
  })
  it('shows exact columns and supplied values without changing source membership', async () => {
    await show()
    const tables = screen.getAllByRole('table')
    expect(within(tables[0]).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?'])
    expect(within(tables[1]).getAllByRole('columnheader').map(el => el.textContent)).toEqual(['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?'])
    tables.forEach(table => expect(table.querySelectorAll('tbody tr')).toHaveLength(5))
    expect(Array.from(tables[0].querySelectorAll('tbody tr')[0].children).map(cell => cell.textContent)).toEqual(['R260', 'Fictional 0', 'Example Road 0', 'TBC', 'N'])
    expect(tables[1].querySelectorAll('tbody tr')[0].children[0].textContent).toBe('R260 / Fictional 0\nExample Road 0')
    expect(tables[1].querySelectorAll('tbody tr')[0].children[3]).toBeEmptyDOMElement()
    expect(screen.getByRole('button', { name: 'Request update' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Save|Edit product/ })).not.toBeInTheDocument()
    expect(mocks.auth).toHaveBeenCalledOnce(); expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.version).not.toHaveBeenCalled()
  })
  it('searches all source rows before paging, preserving independent page sizes', async () => {
    await show({ q: 'fictional 11', jobsPage: '99', jobsSize: '10', itemsSize: '20' })
    expect(screen.getByText('R2611')).toBeVisible()
    expect(screen.getAllByRole('table')[0].querySelectorAll('tbody tr')).toHaveLength(1)
    expect(screen.getAllByRole('table')[1].querySelectorAll('tbody tr')).toHaveLength(0)
    const sizes = screen.getAllByRole('combobox', { name: 'Page size' })
    expect(sizes[0]).toHaveValue('10'); expect(sizes[1]).toHaveValue('20')
    expect(new FormData(sizes[0].closest('form')!).get('itemsSize')).toBe('20')
    expect(screen.getAllByText('Page 1 of 1')).toHaveLength(2)
  })
  it('preserves the other pager and search in next links and material preview works', async () => {
    await show({ jobsPage: '2', itemsPage: '1' })
    const next = screen.getAllByRole('link', { name: 'Next' })
    expect(next[0]).toHaveAttribute('href', expect.stringContaining('jobsPage=3'))
    expect(next[0]).toHaveAttribute('href', expect.stringContaining('itemsPage=1'))
    expect(next[1]).toHaveAttribute('href', expect.stringContaining('jobsPage=2'))
    fireEvent.click(screen.getAllByRole('button', { name: /View material description/ })[0])
    expect(screen.getByRole('dialog')).toHaveTextContent('Shower 0')
    expect(screen.queryByText('Edit product')).not.toBeInTheDocument()
  })
  it('keeps columns and Request update visible when output cannot load', async () => {
    mocks.read.mockRejectedValue(new Error('Private provider details'))
    await show()
    expect(screen.getAllByRole('table')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Request update' })).toBeVisible()
    expect(screen.getByText(/Kanban output could not load/)).toBeVisible()
    expect(screen.queryByText('Private provider details')).not.toBeInTheDocument()
  })
  it('renders published findings and hostile-looking source text as escaped text only', async () => {
    const rows = data(); rows.products[0].cells[2] = '<img src=x onerror=alert(1)>'; rows.products[0].cells[7] = 'PS1 issued PS3 pending'
    mocks.read.mockResolvedValue(snapshot(rows))
    await show()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('PS1 issued PS3 pending')).toBeVisible()
  })
  it('shows no first snapshot yet without disguising a storage failure and renders server-derived history', async () => {
    mocks.read.mockResolvedValue(null)
    const id = '22345678-1234-4123-8123-123456789abc'
    mocks.history.mockResolvedValue({ events: [{ id, receivedAt: '2026-11-20T00:02:00.000Z', sourceAsOf: '2026-11-20T00:00:00.000Z', generatedAt: '2026-11-20T00:01:00.000Z', outcome: 'published', initial: false, counts: { added: 0, removed: 0, changed: 1 } }], hasNext: true })
    mocks.changes.mockResolvedValue({ publicationId: id, outcome: 'published', changes: { added: [], removed: [], changed: [{ table: 'jobs', id: 'stable', column: 1, label: 'Customer', before: 'Before customer', after: 'After customer' }] } })
    await show({ publication: id })
    expect(screen.getByText('No Kanban publication received yet.')).toBeVisible()
    expect(screen.getByText(/0 rows added, 0 removed, 1 fields changed/)).toBeVisible()
    expect(screen.getByText('Before customer')).toBeVisible(); expect(screen.getByText('After customer')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Older publications' })).toHaveAttribute('href', expect.stringContaining('historyPage=2'))
    expect(screen.getAllByRole('table')).toHaveLength(2)
  })
  it.each(['query', 'page size'])('resynchronizes the committed %s control', async field => {
    const view = render(await WorkOrderPage({ searchParams: Promise.resolve({ q: 'old query', itemsSize: '10' }) }))
    const control = field === 'query' ? screen.getByRole('searchbox') : screen.getAllByRole('combobox', { name: 'Page size' })[1]
    fireEvent.change(control, { target: { value: field === 'query' ? 'Typed query' : '20' } })
    view.rerender(await WorkOrderPage({ searchParams: Promise.resolve({ itemsSize: '5' }) }))
    expect(field === 'query' ? screen.getByRole('searchbox') : screen.getAllByRole('combobox', { name: 'Page size' })[1]).toHaveValue(field === 'query' ? '' : '5')
  })
})
