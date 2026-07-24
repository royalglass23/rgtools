import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireModule = vi.hoisted(() => vi.fn())
const getQuoteMovementRecord = vi.hoisted(() => vi.fn())
const getQuoteMovementRefreshStatus = vi.hoisted(() => vi.fn())
const getQuoteMovementActivity = vi.hoisted(() => vi.fn())
const listQuoteMovementJobFetchOutcomes = vi.hoisted(() => vi.fn())
const refreshQuoteMovementDetailAction = vi.hoisted(() => vi.fn())
const routerRefresh = vi.hoisted(() => vi.fn())
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
)

vi.mock('@/lib/guard', () => ({ requireModule }))
vi.mock('../queries', () => ({ getQuoteMovementRecord, getQuoteMovementRefreshStatus, getQuoteMovementActivity, listQuoteMovementJobFetchOutcomes }))
vi.mock('../actions', () => ({ refreshQuoteMovementDetailAction }))
vi.mock('../QuoteMovementRefreshButton', () => ({
  QuoteMovementRefreshButton: ({ refreshPending }: { refreshPending: boolean }) => (
    <button type="button" disabled={refreshPending}>
      {refreshPending ? 'Refresh pending' : 'Refresh now'}
    </button>
  ),
}))
vi.mock('next/navigation', () => ({
  notFound,
  useRouter: () => ({ refresh: routerRefresh }),
}))

import QuoteMovementDetailPage from '@/app/(dashboard)/quote-movement/[id]/page'

describe('Quote Movement detail route shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireModule.mockResolvedValue(undefined)
    refreshQuoteMovementDetailAction.mockResolvedValue({ status: 'requested' })
    getQuoteMovementRefreshStatus.mockResolvedValue({
      lastSuccessfulAt: new Date('2026-07-17T03:00:00Z'),
      lastSuccessfulCount: 1,
      latestFailure: null,
      pendingSince: null,
      isPending: false,
      hasExpiredPending: false,
      isStale: false,
    })
    getQuoteMovementActivity.mockResolvedValue([])
    listQuoteMovementJobFetchOutcomes.mockResolvedValue([])
    getQuoteMovementRecord.mockResolvedValue({
      id: 'record-1',
      servicem8Status: 'Quote',
      servicem8Active: true,
      jobNumber: 'Q260101',
      customerName: 'Alpha Homes',
      jobAddress: '1 Glass Lane',
      quoteValueExcludingGst: '1250.00',
      lastServiceM8SyncedAt: new Date('2026-07-17T03:00:00Z'),
      convertedAt: null,
      workOrderId: null,
    })
  })

  it('opens a protected detail shell from the cached record identity', async () => {
    render(
      await QuoteMovementDetailPage({
        params: Promise.resolve({ id: 'record-1' }),
      }),
    )

    expect(requireModule).toHaveBeenCalledWith('quote-tracker')
    expect(screen.getByRole('heading', { name: 'Q260101' })).toBeInTheDocument()
    expect(screen.getByText('Alpha Homes')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'What Matters Now' }),
    ).toBeInTheDocument()
  })

  it('presents material summary sections, contextual evidence, and Source Coverage', async () => {
    getQuoteMovementRecord.mockResolvedValue({
      id: 'record-1',
      servicem8Status: 'Quote',
      servicem8Active: true,
      jobNumber: 'Q260223',
      customerName: 'Aroha Glass',
      jobAddress: '1 Example Road',
      quoteValueExcludingGst: '1200.00',
      lastServiceM8SyncedAt: new Date('2026-07-20T03:00:00Z'),
      convertedAt: null,
      workOrderId: null,
      sourceCoverage: 'incomplete',
      sourceUnreadCount: 2,
      sourceCoverageDetails: ['2 ServiceM8 sources could not be read.'],
      importantDetailsSummary: {
        currentPosition: {
          text: 'Low-iron glass is confirmed; opening size is unresolved.',
          evidenceSourceIdentities: ['note-current'],
        },
        materialFacts: [
          {
            text: 'The customer selected low-iron glass.',
            evidenceSourceIdentities: ['email-selection'],
          },
        ],
        importantDates: [],
        participants: [],
        unresolvedMatters: [
          {
            text: 'Confirm the final opening dimensions.',
            evidenceSourceIdentities: ['note-current'],
          },
        ],
        latestMeaningfulMovement: {
          text: 'The low-iron selection was recorded.',
          evidenceSourceIdentities: ['email-selection'],
        },
        consentState: null,
      },
    })

    render(
      await QuoteMovementDetailPage({
        params: Promise.resolve({ id: 'record-1' }),
      }),
    )

    expect(
      screen.getByRole('heading', { name: 'Current Position' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Material Facts' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Unresolved Matters' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Important Dates' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Consent State' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Incomplete Source Coverage')).toBeVisible()
    expect(screen.getByText('2 unread sources')).toBeVisible()
    expect(
      screen
        .getAllByRole('link', { name: 'View supporting evidence' })
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/quote-movement/record-1/evidence/note-current',
      '/quote-movement/record-1/evidence/note-current',
      '/quote-movement/record-1/evidence/email-selection',
      '/quote-movement/record-1/evidence/email-selection',
    ])
    expect(screen.queryByText('note-current')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/score|ranking|recommended action/i),
    ).not.toBeInTheDocument()
  })

  it('does not expose a detail shell for an unknown cached record', async () => {
    getQuoteMovementRecord.mockResolvedValue(null)

    await expect(
      QuoteMovementDetailPage({
        params: Promise.resolve({ id: 'missing' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('continues a converted record into its current Work Order', async () => {
    getQuoteMovementRecord.mockResolvedValue({
      id: 'record-1',
      servicem8Status: 'Work Order',
      servicem8Active: true,
      jobNumber: 'Q260101',
      customerName: 'Alpha Homes',
      jobAddress: '1 Glass Lane',
      quoteValueExcludingGst: '1250.00',
      lastServiceM8SyncedAt: new Date('2026-07-20T03:00:00Z'),
      convertedAt: new Date('2026-07-20T02:00:00Z'),
      workOrderId: 'work-order-1',
    })

    render(
      await QuoteMovementDetailPage({
        params: Promise.resolve({ id: 'record-1' }),
      }),
    )

    expect(
      screen.getByRole('link', { name: 'Open Work Order' }),
    ).toHaveAttribute('href', '/work-orders/work-order-1')
  })

  it('keeps the last valid detail summary visible when refresh is stale and summarisation failed', async () => {
    getQuoteMovementRefreshStatus.mockResolvedValue({
      lastSuccessfulAt: new Date('2026-07-20T01:00:00Z'),
      lastSuccessfulCount: 1,
      latestFailure: null,
      pendingSince: null,
      isPending: false,
      hasExpiredPending: false,
      isStale: true,
    })
    getQuoteMovementRecord.mockResolvedValue({
      id: 'record-1',
      servicem8Status: 'Quote',
      servicem8Active: true,
      jobNumber: 'Q260224',
      customerName: 'Cached Customer',
      jobAddress: '24 Glass Lane',
      quoteValueExcludingGst: '2400.00',
      lastServiceM8SyncedAt: new Date('2026-07-20T01:00:00Z'),
      convertedAt: null,
      workOrderId: null,
      sourceCoverage: 'incomplete',
      sourceUnreadCount: 1,
      sourceCoverageDetails: ['1 source could not be interpreted.'],
      summaryLastError: 'What Matters Now could not update. The previous valid summary was kept.',
      importantDetailsSummary: {
        currentPosition: { text: 'Cached current position.', evidenceSourceIdentities: [] },
        materialFacts: [],
        importantDates: [],
        participants: [],
        unresolvedMatters: [],
        latestMeaningfulMovement: null,
        consentState: null,
      },
    })

    render(await QuoteMovementDetailPage({ params: Promise.resolve({ id: 'record-1' }) }))

    expect(screen.getByText('Cached current position.')).toBeVisible()
    expect(screen.getByText(/cached data may be out of date/i)).toBeVisible()
    expect(screen.getByText(/previous valid summary was kept/i)).toBeVisible()
    expect(screen.queryByText(/job-[0-9a-f]|postgres:\/\//i)).not.toBeInTheDocument()
  })

  it('shows a safe first-summary failure while no prior summary exists', async () => {
    getQuoteMovementRecord.mockResolvedValue({
      id: 'record-1',
      servicem8Status: 'Quote',
      servicem8Active: true,
      jobNumber: 'Q260224',
      customerName: 'Cached Customer',
      jobAddress: '24 Glass Lane',
      quoteValueExcludingGst: '2400.00',
      lastServiceM8SyncedAt: new Date('2026-07-21T01:00:00Z'),
      convertedAt: null,
      workOrderId: null,
      sourceCoverage: 'incomplete',
      sourceUnreadCount: 1,
      sourceCoverageDetails: ['1 source could not be interpreted.'],
      summaryLastError: 'What Matters Now could not update. The previous valid summary was kept.',
      importantDetailsSummary: null,
    })

    render(await QuoteMovementDetailPage({ params: Promise.resolve({ id: 'record-1' }) }))

    expect(screen.getByText('Not yet summarised. What Matters Now updates automatically after meaningful source activity.')).toBeVisible()
    expect(screen.getByText(/What Matters Now could not update/)).toBeVisible()
    expect(screen.getByText('Incomplete Source Coverage')).toBeVisible()
  })

  it('reports when a converted record has no current Work Order match', async () => {
    getQuoteMovementRecord.mockResolvedValue({
      id: 'record-1',
      servicem8Status: 'Work Order',
      servicem8Active: true,
      jobNumber: 'Q260101',
      customerName: 'Alpha Homes',
      jobAddress: '1 Glass Lane',
      quoteValueExcludingGst: '1250.00',
      lastServiceM8SyncedAt: new Date('2026-07-20T03:00:00Z'),
      convertedAt: new Date('2026-07-20T02:00:00Z'),
      workOrderId: null,
    })

    render(
      await QuoteMovementDetailPage({
        params: Promise.resolve({ id: 'record-1' }),
      }),
    )

    expect(
      screen.getByText('Work Order record not yet available'),
    ).toBeVisible()
  })
})
