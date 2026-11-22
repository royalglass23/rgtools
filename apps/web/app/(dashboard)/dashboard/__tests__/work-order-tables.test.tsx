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
  it('renders separate material controls for the older combined abbreviation publication used by Preview', async () => {
    const rows = data()
    rows.products[0].cells[1] = 'Bal 12m; SB; HR'
    mocks.read.mockResolvedValue(snapshot(rows))
    await show()
    const table = screen.getAllByRole('table')[1]
    const cell = table.querySelector('tbody tr')!.children[1] as HTMLElement
    expect(within(cell).getAllByRole('button').map(button => button.textContent)).toEqual(['Bal 12m', 'SB', 'HR'])
    fireEvent.click(within(cell).getByRole('button', { name: 'View material description: SB' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Splashback')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Bal 12m; SB; HR')
  })
  const billingRows = () => {
    const rows = data()
    const parent = '11111111-1111-4111-8111-111111111111'
    rows.jobs[0].key = parent
    rows.products = Array.from({ length: 12 }, (_, index) => ({
      key: `${parent}:22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
      cells: ['TEST409 / Fictional parent\nExample Road', index === 1 || index === 11 ? 'Same balustrade' : `Material ${index}`, 'Sample', 'N', '?', 'Y', 'Y', 'PS1 pending', 'N', '?', 'N'],
    }))
    return rows
  }
  it('keeps a job and all separate material previews together on one row and one page', async () => {
    mocks.read.mockResolvedValue(snapshot(billingRows()))
    await show({ jobsPage: '2', itemsPage: '2' })
    const table = screen.getAllByRole('table')[1]
    const rows = Array.from(table.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(1)
    expect(rows.every(row => row.children.length === 11 && row.children[0].textContent?.startsWith('TEST409 / Fictional parent'))).toBe(true)
    expect(within(table).getByText('Material 5')).toBeVisible()
    expect(within(table).getByText('Material 10')).toBeVisible()
    expect(within(table).getAllByRole('button', { name: /View material description/ })).toHaveLength(12)
    fireEvent.click(within(table).getByRole('button', { name: 'View material description: Material 10' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Material 10')
    expect(screen.getAllByRole('link', { name: 'Next' })).toHaveLength(1)
    expect(screen.getByText('1 work order')).toBeVisible()
  })
  it('finds duplicate descriptions across all source lines and retains every material in the job', async () => {
    mocks.read.mockResolvedValue(snapshot(billingRows()))
    await show({ q: 'same BALUSTRADE', itemsPage: '3' })
    const table = screen.getAllByRole('table')[1]
    expect(table.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(within(table).getAllByRole('button', { name: 'View material description: Bal' })).toHaveLength(2)
    expect(within(table).getByText('Material 0')).toBeVisible()
    expect(within(table).getAllByRole('button', { name: /View material description/ })).toHaveLength(12)
    expect(screen.getAllByText('Page 1 of 1')).toHaveLength(2)
  })
  it('paginates complete job groups and preserves the other table page and size', async () => {
    const rows = data()
    rows.products = rows.jobs.flatMap((job, index) => {
      const parent = `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`
      job.key = parent
      return [0, 1].map(line => ({ key: `${parent}:22222222-2222-4222-8222-${String(line).padStart(12, '0')}`, cells: [`${job.cells[0]} / ${job.cells[1]}\n${job.cells[2]}`, line ? 'Splashback' : 'Handrail', 'Waiting', '?', '?', '?', '?', '?', '?', '?', '?'] }))
    })
    mocks.read.mockResolvedValue(snapshot(rows))
    await show({ jobsPage: '2', itemsPage: '2', jobsSize: '5', itemsSize: '5' })
    const table = screen.getAllByRole('table')[1]
    expect(table.querySelectorAll('tbody tr')).toHaveLength(5)
    expect(within(table).getAllByRole('button', { name: /View material description/ })).toHaveLength(10)
    expect(table.querySelector('tbody tr')?.textContent).toContain('R265')
    const next = screen.getAllByRole('link', { name: 'Next' })[1]
    expect(next).toHaveAttribute('href', expect.stringContaining('itemsPage=3'))
    expect(next).toHaveAttribute('href', expect.stringContaining('jobsPage=2'))
    expect(next).toHaveAttribute('href', expect.stringContaining('jobsSize=5'))
  })
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
  it('describes an accepted initial empty snapshot without claiming rejection', async () => {
    const id = '22345678-1234-4123-8123-123456789abc'
    mocks.read.mockResolvedValue(snapshot({ jobs: [], products: [] }))
    mocks.changes.mockResolvedValue({ publicationId: id, outcome: 'published', initial: true, changes: { added: [], removed: [], changed: [] } })
    await show({ publication: id })
    expect(screen.getByRole('region', { name: 'Publication changes' })).toHaveTextContent('No row or field changes.')
    expect(screen.queryByText('This publication did not replace the stored snapshot.')).not.toBeInTheDocument()
  })
  it.each(['query', 'page size'])('resynchronizes the committed %s control', async field => {
    const view = render(await WorkOrderPage({ searchParams: Promise.resolve({ q: 'old query', itemsSize: '10' }) }))
    const control = field === 'query' ? screen.getByRole('searchbox') : screen.getAllByRole('combobox', { name: 'Page size' })[1]
    fireEvent.change(control, { target: { value: field === 'query' ? 'Typed query' : '20' } })
    view.rerender(await WorkOrderPage({ searchParams: Promise.resolve({ itemsSize: '5' }) }))
    expect(field === 'query' ? screen.getByRole('searchbox') : screen.getAllByRole('combobox', { name: 'Page size' })[1]).toHaveValue(field === 'query' ? '' : '5')
  })
})
