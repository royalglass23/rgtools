import { render, screen } from '@testing-library/react'
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

  it('defaults to seven days with explicit source limits and booking status', async () => {
    render(await JobProgressPage({ searchParams: Promise.resolve({}) }))
    expect(requireModuleMock).toHaveBeenCalledWith('admin')
    expect(screen.getByRole('heading', { name: 'Job progress' })).toBeInTheDocument()
    expect(screen.getByText('Customer A')).toBeInTheDocument()
    expect(screen.getByText('Customer B')).toBeInTheDocument()
    expect(screen.queryByText('Customer C')).not.toBeInTheDocument()
    expect(screen.queryByText('Customer D')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '7 days' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '14 days' })).toHaveAttribute('href', '/admin/job-progress?days=14')
    expect(screen.getByText('No Upcoming Booking')).toBeInTheDocument()
    expect(screen.getAllByText('Next action: not verified from Diary')).toHaveLength(2)
  })

  it('shows older jobs at 30 days and preserves the period through view and search', async () => {
    render(await JobProgressPage({ searchParams: Promise.resolve({ days: '30', view: 'review', q: 'Customer C' }) }))
    expect(screen.getByText('Customer C')).toBeInTheDocument()
    expect(screen.queryByText('Customer A')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '30 days' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '14 days' })).toHaveAttribute('href', '/admin/job-progress?view=review&q=Customer+C&days=14')
    expect(screen.getByRole('searchbox', { name: 'Find a job' })).toHaveValue('Customer C')
  })

  it('keeps the complete returned inventory reachable with All dates', async () => {
    render(await JobProgressPage({ searchParams: Promise.resolve({ days: 'all' }) }))
    expect(screen.getByText('Customer D')).toBeInTheDocument()
    expect(screen.getByText('Customer C')).toBeInTheDocument()
  })

  it('does not render a partial inventory when the ServiceM8 read fails', async () => {
    snapshotMock.mockRejectedValue(new Error('schedule page denied'))
    render(await JobProgressPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: 'Job progress is unavailable' })).toBeInTheDocument()
    expect(screen.queryByText('Customer A')).not.toBeInTheDocument()
  })
})
