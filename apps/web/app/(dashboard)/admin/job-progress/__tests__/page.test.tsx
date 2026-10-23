import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.hoisted(() => vi.fn())
const requireModuleMock = vi.hoisted(() => vi.fn())
const snapshotMock = vi.hoisted(() => vi.fn())
const redirectMock = vi.hoisted(() => vi.fn(() => { throw new Error('redirected') }))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/guard', () => ({ requireModule: requireModuleMock }))
vi.mock('@/modules/job-progress/registry', () => ({ getJobProgressSnapshot: snapshotMock }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

import JobProgressPage from '../page'

const snapshot = {
  asOf: '2026-10-23T00:00:00.000Z', unnumberedJobs: 0, duplicateNumberJobs: 0, missingCustomer: 0,
  missingAddress: 0, missingValue: 1,
  rows: [
    { uuid: 'a', jobNumber: 'R100', status: 'Quote', active: true, duplicateNumber: false, customer: 'Customer A', address: 'A St', recordedAmount: null, amountSource: null, lastUpdate: '2026-10-22 10:00:00', description: 'Glass quote', nextBooking: null, reviewCandidate: true },
    { uuid: 'b', jobNumber: 'R101', status: 'Work Order', active: true, duplicateNumber: false, customer: 'Customer B', address: 'B St', recordedAmount: 150, amountSource: 'invoice', lastUpdate: '2026-10-21 10:00:00', description: 'Repair', nextBooking: { start: '2026-10-26 09:00:00', staff: 'Alex Smith' }, reviewCandidate: false },
    { uuid: 'c', jobNumber: 'R102', status: 'Quote', active: true, duplicateNumber: false, customer: 'Customer C', address: 'C St', recordedAmount: 300, amountSource: 'invoice', lastUpdate: '2026-10-01 10:00:00', description: 'Old quote', nextBooking: null, reviewCandidate: true },
    { uuid: 'd', jobNumber: 'R103', status: 'Quote', active: true, duplicateNumber: false, customer: 'Customer D', address: 'D St', recordedAmount: 400, amountSource: 'invoice', lastUpdate: null, description: 'Unknown update date', nextBooking: null, reviewCandidate: true },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } })
  snapshotMock.mockResolvedValue(snapshot)
})

describe('admin job progress page', () => {
  it('denies staff before reading any customer data', async () => {
    authMock.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
    await expect(JobProgressPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirected')
    expect(redirectMock).toHaveBeenCalledWith('/?denied=admin')
    expect(requireModuleMock).not.toHaveBeenCalled()
    expect(snapshotMock).not.toHaveBeenCalled()
  })

  it('defaults to seven days and five jobs per page without the coverage notice', async () => {
    render(await JobProgressPage({ searchParams: Promise.resolve({}) }))
    expect(requireModuleMock).toHaveBeenCalledWith('admin')
    expect(screen.getByRole('heading', { name: 'Job progress' })).toBeInTheDocument()
    expect(screen.getByText('Customer A')).toBeInTheDocument()
    expect(screen.getByText('Customer B')).toBeInTheDocument()
    expect(screen.queryByText('Customer C')).not.toBeInTheDocument()
    expect(screen.queryByText('Customer D')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '7 days' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '14 days' })).toHaveAttribute('href', '/admin/job-progress?days=14')
    expect(screen.getByRole('combobox', { name: 'Jobs per page' })).toHaveValue('5')
    expect(within(screen.getByRole('combobox', { name: 'Jobs per page' })).getAllByRole('option').map((option) => option.textContent)).toEqual(['5', '10', '20', '50'])
    expect(screen.queryByText(/Coverage limit:/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upcoming bookings' })).toHaveAttribute('href', '/admin/job-progress?view=upcoming')
    expect(screen.getByText('No Upcoming Booking')).toBeInTheDocument()
    expect(screen.getAllByText('Next action: not verified from Diary')).toHaveLength(2)
  })

  it('shows older jobs at 30 days and preserves the period through view and search', async () => {
    render(await JobProgressPage({ searchParams: Promise.resolve({ days: '30', view: 'review', q: 'Customer C', size: '20' }) }))
    expect(screen.getByText('Customer C')).toBeInTheDocument()
    expect(screen.queryByText('Customer A')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '30 days' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '14 days' })).toHaveAttribute('href', '/admin/job-progress?view=review&q=Customer+C&days=14&size=20')
    expect(screen.getByRole('searchbox', { name: 'Find a job' })).toHaveValue('Customer C')
    expect(screen.getByRole('searchbox', { name: 'Find a job' }).closest('form')).toHaveFormValues({ view: 'review', days: '30', size: '20', q: 'Customer C' })
    expect(screen.getByRole('combobox', { name: 'Jobs per page' }).closest('form')).toHaveFormValues({ view: 'review', days: '30', size: '20', q: 'Customer C' })
  })

  it('keeps the complete returned inventory reachable with All dates', async () => {
    render(await JobProgressPage({ searchParams: Promise.resolve({ days: 'all' }) }))
    expect(screen.getByText('Customer D')).toBeInTheDocument()
    expect(screen.getByText('Customer C')).toBeInTheDocument()
  })

  it('shows upcoming bookings earliest first and paginates after sorting', async () => {
    const bookings = Array.from({ length: 6 }, (_, index) => ({
      ...snapshot.rows[1],
      uuid: `booking-${index}`,
      jobNumber: `R20${index}`,
      customer: `Customer ${index}`,
      nextBooking: { start: `2026-10-${String(29 - index).padStart(2, '0')} 09:00:00`, staff: 'Alex Smith' },
    }))
    snapshotMock.mockResolvedValue({ ...snapshot, rows: [snapshot.rows[0], ...bookings] })

    const firstPage = render(await JobProgressPage({ searchParams: Promise.resolve({ view: 'upcoming' }) }))
    const table = screen.getByRole('table')
    const numbers = within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)
    expect(numbers).toEqual(['R205Work Order', 'R204Work Order', 'R203Work Order', 'R202Work Order', 'R201Work Order'])
    expect(screen.queryByText('Customer A')).not.toBeInTheDocument()
    expect(screen.queryByText('Customer 0')).not.toBeInTheDocument()
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/admin/job-progress?view=upcoming&page=2')

    firstPage.unmount()
    const secondPage = render(await JobProgressPage({ searchParams: Promise.resolve({ view: 'upcoming', page: '2' }) }))
    expect(screen.getByText('Customer 0')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/admin/job-progress?view=upcoming')

    secondPage.unmount()
    render(await JobProgressPage({ searchParams: Promise.resolve({ view: 'upcoming', size: '10' }) }))
    expect(screen.getByRole('combobox', { name: 'Jobs per page' })).toHaveValue('10')
    expect(screen.getByText('Customer 0')).toBeInTheDocument()
    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument()
  })

  it('does not render a partial inventory when the ServiceM8 read fails', async () => {
    snapshotMock.mockRejectedValue(new Error('schedule page denied'))
    render(await JobProgressPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: 'Job progress is unavailable' })).toBeInTheDocument()
    expect(screen.queryByText('Customer A')).not.toBeInTheDocument()
  })
})
