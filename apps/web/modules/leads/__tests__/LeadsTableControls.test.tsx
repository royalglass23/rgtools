import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LeadsListFilters } from '../queries'
import type { TablePrefs } from '../table-prefs-shared'
import { LeadsTableControls } from '../LeadsTableControls'

const pushMock = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('../actions', () => ({
  batchDeleteLeadsAction: vi.fn(),
  restoreLeadAction: vi.fn(),
}))

vi.mock('../table-prefs-actions', () => ({
  saveTablePrefs: vi.fn(),
}))

const filters: LeadsListFilters = {
  q: '',
  tier: 'all',
  sm8: 'all',
  date: 'all',
  stale: false,
  statusView: 'current_quotes',
  page: 1,
  size: 10,
  sortColumn: 'createdAt',
  sortDir: 'desc',
}

const prefs: TablePrefs = {
  columns: [
    { key: 'client', visible: true },
    { key: 'date', visible: true },
    { key: 'address', visible: false },
  ],
  sortColumn: 'createdAt',
  sortDir: 'desc',
}

const rows = [{
  id: 'lead-1',
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  clientName: 'Ada Lovelace',
  companyName: 'Analytical Glass',
  location: 'Hidden Road',
  projectType: 'Frameless shower',
  tier: 'A',
  seedScore: 92,
  servicem8JobUuid: null,
  servicem8JobNumber: null,
  servicem8Status: null,
  syncStatus: 'pending_sync',
  completeness: 80,
  rcStatus: 'Required',
  bcStatus: 'Not required',
  buildingStage: 'Planning',
  followUpDate: '2026-06-20',
  updatedAt: new Date('2026-06-02T00:00:00.000Z'),
  aiSuggestion: 'Call this lead tomorrow',
}]

describe('LeadsTableControls', () => {
  it('applies the selected page size only after Apply', () => {
    pushMock.mockClear()
    render(<LeadsTableControls filters={filters} rows={rows} total={12} pageCount={2} isAdmin={false} prefs={prefs} />)

    const select = screen.getByRole('combobox', { name: 'Page size' })
    expect(screen.getByRole('navigation', { name: 'Lead pages' })).toHaveTextContent('Page 1 of 2')
    fireEvent.change(select, { target: { value: '20' } })
    expect(pushMock).not.toHaveBeenCalled()
    fireEvent.click(select.closest('form')!.querySelector('button')!)
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('size=20'))
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('page=1'))
  })

  it('renders visible columns in preference order and hides hidden columns', () => {
    render(
      <LeadsTableControls
        filters={filters}
        rows={rows}
        total={1}
        pageCount={1}
        isAdmin={false}
        prefs={prefs}
      />,
    )

    const table = screen.getByRole('table')
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent)

    expect(headers).toEqual(['Client', 'Date (desc)'])
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByText('Job Address')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden Road')).not.toBeInTheDocument()
  })

  it('shows Restore actions only in the admin Archived only view', () => {
    const { rerender } = render(
      <LeadsTableControls
        filters={{ ...filters, statusView: 'archived' }}
        rows={rows}
        total={1}
        pageCount={1}
        isAdmin
        prefs={prefs}
      />,
    )

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()

    rerender(
      <LeadsTableControls
        filters={{ ...filters, statusView: 'all_statuses' }}
        rows={rows}
        total={1}
        pageCount={1}
        isAdmin
        prefs={prefs}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
  })

  it('keeps restore forms separate from the batch archive form', () => {
    render(
      <LeadsTableControls
        filters={{ ...filters, statusView: 'archived' }}
        rows={rows}
        total={1}
        pageCount={1}
        isAdmin
        prefs={prefs}
      />,
    )

    expect(document.querySelector('form form')).toBeNull()
    expect(screen.getByRole('button', { name: 'Restore' }).closest('form')).not.toHaveAttribute('id', 'batch-delete-form')
  })

  it('labels unscored imported leads as needing scoring instead of showing fallback score values', () => {
    render(
      <LeadsTableControls
        filters={filters}
        rows={[{ ...rows[0], tier: null, seedScore: null, completeness: null }]}
        total={1}
        pageCount={1}
        isAdmin={false}
        prefs={{
          ...prefs,
          columns: [
            { key: 'tier', visible: true },
            { key: 'score', visible: true },
            { key: 'completeness', visible: true },
          ],
        }}
      />,
    )

    const table = screen.getByRole('table')
    expect(within(table).getByText('Needs scoring')).toBeInTheDocument()
    expect(within(table).getAllByText('-')).toHaveLength(2)
    expect(within(table).queryByText('D')).not.toBeInTheDocument()
  })

  it('renders coded lead values as human-readable labels', () => {
    render(
      <LeadsTableControls
        filters={filters}
        rows={[{
          ...rows[0],
          projectType: 'balcony_balustrade',
          rcStatus: 'approved_not_required',
          bcStatus: 'submitted_pending',
          buildingStage: 'ready_for_glazing',
        }]}
        total={1}
        pageCount={1}
        isAdmin={false}
        prefs={{
          ...prefs,
          columns: [
            { key: 'project', visible: true },
            { key: 'rcStatus', visible: true },
            { key: 'bcStatus', visible: true },
            { key: 'buildingStage', visible: true },
          ],
        }}
      />,
    )

    const table = screen.getByRole('table')
    expect(within(table).getByText('Balcony Balustrade')).toBeInTheDocument()
    expect(within(table).getByText('Approved Not Required')).toBeInTheDocument()
    expect(within(table).getByText('Submitted Pending')).toBeInTheDocument()
    expect(within(table).getByText('Ready For Glazing')).toBeInTheDocument()
    expect(within(table).queryByText('balcony_balustrade')).not.toBeInTheDocument()
  })

  it('offers Tier E filtering and A-E sort labels', () => {
    render(
      <LeadsTableControls
        filters={{ ...filters, tier: 'E' }}
        rows={[{ ...rows[0], tier: 'E' }]}
        total={1}
        pageCount={1}
        isAdmin={false}
        prefs={{
          ...prefs,
          columns: [{ key: 'tier', visible: true }],
        }}
      />,
    )

    expect(screen.getByRole('combobox', { name: /Tier/ })).toHaveValue('E')
    expect(screen.getByRole('option', { name: 'E' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tier A-E' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tier E-A' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('E')).toBeInTheDocument()
  })
})
