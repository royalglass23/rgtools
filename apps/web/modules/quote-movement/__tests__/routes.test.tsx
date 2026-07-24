import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireModule = vi.hoisted(() => vi.fn())
const listQuoteMovementRecords = vi.hoisted(() => vi.fn())
const getQuoteMovementRefreshStatus = vi.hoisted(() => vi.fn())
const refreshQuoteMovementAction = vi.hoisted(() => vi.fn())
const refreshQuoteMovementJobAction = vi.hoisted(() => vi.fn())
const routerRefresh = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: routerRefresh }) }))

vi.mock('@/lib/guard', () => ({ requireModule }))
vi.mock('../queries', () => ({
  listQuoteMovementRecords,
  getQuoteMovementRefreshStatus,
}))
vi.mock('../actions', () => ({
  refreshQuoteMovementAction,
  refreshQuoteMovementJobAction,
  updateQuoteMovementComplexityAction: vi.fn(),
}))
vi.mock('../QuoteMovementRefreshButton', () => ({
  QuoteMovementRefreshButton: ({ refreshPending, automatic }: { refreshPending: boolean; automatic?: boolean }) => (
    <button type="button" disabled={refreshPending} data-automatic={String(automatic)}>
      {refreshPending ? 'Refresh pending' : 'Refresh now'}
    </button>
  ),
}))

import QuoteMovementLayout from '@/app/(dashboard)/quote-movement/layout'
import QuoteMovementPage from '@/app/(dashboard)/quote-movement/page'

describe('Quote Movement routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireModule.mockResolvedValue(undefined)
    listQuoteMovementRecords.mockResolvedValue([])
    getQuoteMovementRefreshStatus.mockResolvedValue({
      lastSuccessfulAt: null,
      lastSuccessfulCount: 0,
      latestFailure: null,
      pendingSince: null,
      isPending: false,
      isStale: true,
    })
    refreshQuoteMovementAction.mockResolvedValue({ status: 'requested' })
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

  it('stops before list persistence reads when page access is denied', async () => {
    requireModule.mockRejectedValue(Object.assign(new Error('NEXT_REDIRECT'), {
      url: '/?denied=quote-tracker',
    }))

    await expect(
      QuoteMovementPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toMatchObject({ url: '/?denied=quote-tracker' })
    expect(listQuoteMovementRecords).not.toHaveBeenCalled()
    expect(getQuoteMovementRefreshStatus).not.toHaveBeenCalled()
  })

  it('renders cached active Quote jobs with refresh metadata and detail links', async () => {
    listQuoteMovementRecords.mockResolvedValue([{
      id: 'record-1',
      servicem8JobUuid: 'job-1',
      servicem8CompanyUuid: 'company-1',
      servicem8Status: 'Quote',
      servicem8Active: true,
      jobNumber: 'Q260101',
      customerName: 'Alpha Homes',
      jobAddress: '1 Glass Lane',
      quoteValueExcludingGst: '1250.00',
      projectComplexity: 'unassessed',
      sourceUpdatedAt: new Date('2026-07-17T01:00:00Z'),
      latestActivityAt: new Date('2026-07-17T02:00:00Z'),
      lastServiceM8SyncedAt: new Date('2026-07-17T03:00:00Z'),
      createdAt: new Date('2026-07-17T03:00:00Z'),
      updatedAt: new Date('2026-07-17T03:00:00Z'),
    }])
    getQuoteMovementRefreshStatus.mockResolvedValue({
      lastSuccessfulAt: new Date('2026-07-17T03:00:00Z'),
      lastSuccessfulCount: 1,
      latestFailure: null,
      pendingSince: null,
      isPending: false,
      isStale: false,
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

  it('keeps cached rows visible while refresh and stale states are explicit', async () => {
    listQuoteMovementRecords.mockResolvedValue([{
      id: 'record-1',
      jobNumber: 'Q260224',
      customerName: 'Cached Customer',
      jobAddress: '24 Glass Lane',
      quoteValueExcludingGst: '2400.00',
      projectComplexity: 'normal',
      latestActivityAt: new Date('2026-07-20T02:00:00Z'),
      convertedAt: null,
      workOrderId: null,
    }])
    getQuoteMovementRefreshStatus.mockResolvedValue({
      lastSuccessfulAt: new Date('2026-07-20T01:00:00Z'),
      lastSuccessfulCount: 1,
      latestFailure: null,
      pendingSince: new Date('2026-07-21T01:00:00Z'),
      isPending: true,
      isStale: true,
    })

    render(await QuoteMovementPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Cached Customer')).toBeVisible()
    expect(screen.getByText(/cached quotes remain available while/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Refresh pending' })).toBeDisabled()
  })

  it('shows a clear empty state when the cached active list is empty', async () => {
    render(await QuoteMovementPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('No active ServiceM8 Quote jobs.')).toBeInTheDocument()
  })

  it('keeps automatic retry enabled after an expired pending refresh', async () => {
    getQuoteMovementRefreshStatus.mockResolvedValue({
      lastSuccessfulAt: null,
      lastSuccessfulCount: 0,
      latestFailure: null,
      pendingSince: null,
      isPending: false,
      hasExpiredPending: true,
      isStale: true,
    })

    render(await QuoteMovementPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByRole('button', { name: 'Refresh now' })).toHaveAttribute(
      'data-automatic',
      'true',
    )
  })

  it('uses validated URL controls to load and present the selected list', async () => {
    render(await QuoteMovementPage({
      searchParams: Promise.resolve({
        search: 'Alpha',
        projectComplexity: 'tight',
        lifecycle: 'converted',
        sort: 'quote_value',
      }),
    }))

    expect(listQuoteMovementRecords).toHaveBeenCalledWith({
      search: 'Alpha',
      projectComplexity: 'tight',
      lifecycle: 'converted',
      sort: 'quote_value',
    })
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('Alpha')
    expect(screen.getByRole('combobox', { name: 'Complexity' })).toHaveValue('tight')
    expect(screen.getByRole('combobox', { name: 'Active/Converted' })).toHaveValue('converted')
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('quote_value')
  })
})
