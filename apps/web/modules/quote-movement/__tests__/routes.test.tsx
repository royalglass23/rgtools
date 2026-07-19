import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireModule = vi.hoisted(() => vi.fn())
const listActiveQuoteMovementRecords = vi.hoisted(() => vi.fn())
const getQuoteMovementRefreshStatus = vi.hoisted(() => vi.fn())

vi.mock('@/lib/guard', () => ({ requireModule }))
vi.mock('../queries', () => ({
  listActiveQuoteMovementRecords,
  getQuoteMovementRefreshStatus,
}))
vi.mock('../actions', () => ({ refreshQuoteMovementAction: vi.fn() }))

import QuoteMovementLayout from '@/app/(dashboard)/quote-movement/layout'
import QuoteMovementPage from '@/app/(dashboard)/quote-movement/page'

describe('Quote Movement routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireModule.mockResolvedValue(undefined)
    listActiveQuoteMovementRecords.mockResolvedValue([])
    getQuoteMovementRefreshStatus.mockResolvedValue({
      lastSuccessfulAt: null,
      lastSuccessfulCount: 0,
      latestFailure: null,
    })
  })

  it('reuses Quote Tracker access for the complete route family', async () => {
    await QuoteMovementLayout({ children: <div>Allowed</div> })

    expect(requireModule).toHaveBeenCalledWith('quote-tracker')
  })

  it('stops direct access when Quote Tracker permission is denied', async () => {
    requireModule.mockRejectedValue(Object.assign(new Error('NEXT_REDIRECT'), {
      url: '/?denied=quote-tracker',
    }))

    await expect(QuoteMovementLayout({ children: <div /> })).rejects.toMatchObject({
      url: '/?denied=quote-tracker',
    })
  })

  it('renders cached active Quote jobs with refresh metadata and detail links', async () => {
    listActiveQuoteMovementRecords.mockResolvedValue([{
      id: 'record-1',
      servicem8JobUuid: 'job-1',
      servicem8CompanyUuid: 'company-1',
      servicem8Status: 'Quote',
      servicem8Active: true,
      jobNumber: 'Q260101',
      customerName: 'Alpha Homes',
      jobAddress: '1 Glass Lane',
      quoteValueExcludingGst: '1250.00',
      sourceUpdatedAt: new Date('2026-07-17T01:00:00Z'),
      lastServiceM8SyncedAt: new Date('2026-07-17T03:00:00Z'),
      createdAt: new Date('2026-07-17T03:00:00Z'),
      updatedAt: new Date('2026-07-17T03:00:00Z'),
    }])
    getQuoteMovementRefreshStatus.mockResolvedValue({
      lastSuccessfulAt: new Date('2026-07-17T03:00:00Z'),
      lastSuccessfulCount: 1,
      latestFailure: null,
    })

    render(await QuoteMovementPage({ searchParams: Promise.resolve({}) }))

    expect(requireModule).toHaveBeenCalledWith('quote-tracker')
    expect(screen.getByRole('heading', { name: 'Quote Movement' })).toBeInTheDocument()
    expect(screen.getByText('Alpha Homes')).toBeInTheDocument()
    expect(screen.getByText('1 Glass Lane')).toBeInTheDocument()
    expect(screen.getByText('$1,250.00')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Q260101' })).toHaveAttribute('href', '/quote-movement/record-1')
    expect(screen.getByText(/Last refreshed/)).toBeInTheDocument()
  })

  it('shows a clear empty state when the cached active list is empty', async () => {
    render(await QuoteMovementPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('No active ServiceM8 Quote jobs.')).toBeInTheDocument()
  })
})
