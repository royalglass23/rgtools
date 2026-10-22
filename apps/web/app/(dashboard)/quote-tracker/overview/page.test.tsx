import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireModule, getTrackedQuoteOverview } = vi.hoisted(() => ({
  requireModule: vi.fn(),
  getTrackedQuoteOverview: vi.fn(),
}))

vi.mock('@/lib/guard', () => ({ requireModule }))
vi.mock('@/modules/quote-tracker/overview-queries', () => ({ getTrackedQuoteOverview }))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}))

import TrackedQuoteOverviewPage from './page'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('TrackedQuoteOverviewPage', () => {
  it('checks the Quote Tracker grant before reading engagement data', async () => {
    requireModule.mockRejectedValueOnce(new Error('denied'))
    await expect(TrackedQuoteOverviewPage()).rejects.toThrow('denied')
    expect(requireModule).toHaveBeenCalledWith('quote-tracker')
    expect(getTrackedQuoteOverview).not.toHaveBeenCalled()
  })

  it('shows observed activity and quote drill-downs without viewer identity', async () => {
    getTrackedQuoteOverview.mockResolvedValueOnce({
      asOf: new Date('2026-10-22T03:00:00Z'),
      snapshot: { activeLinks: 2, viewedLastSevenDays: 1, neverOpened: 1 },
      activity: [{ id: 'event-1', quoteId: 'quote-1', clientName: 'Ada', workOrderId: 'Q100', eventType: 'open', createdAt: new Date('2026-10-22T02:00:00Z') }],
      attention: [{ id: 'quote-2', clientName: 'Lee', workOrderId: 'Q200', reasons: ['No opens yet'], lastOpenedAt: null }],
    })

    render(await TrackedQuoteOverviewPage())

    expect(screen.getByRole('heading', { name: 'Tracked quote activity' })).toBeInTheDocument()
    expect(screen.getByText('Opened the quote')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Q100 · Ada/ })).toHaveAttribute('href', '/quote-tracker/quote-1')
    expect(screen.getByRole('link', { name: /Q200 · Lee/ })).toHaveAttribute('href', '/quote-tracker/quote-2')
    expect(screen.getByText('No opens yet')).toBeInTheDocument()
    expect(screen.getByText('Each line is an event, not a unique viewer or a confirmed sale.')).toBeInTheDocument()
  })

  it('explains when there is no recorded activity', async () => {
    getTrackedQuoteOverview.mockResolvedValueOnce({
      asOf: new Date('2026-10-22T03:00:00Z'),
      snapshot: { activeLinks: 0, viewedLastSevenDays: 0, neverOpened: 0 },
      activity: [],
      attention: [],
    })

    render(await TrackedQuoteOverviewPage())
    expect(screen.getByText(/No quote opens, downloads, or action clicks/)).toBeInTheDocument()
    expect(screen.getByText(/No active tracked quotes currently match/)).toBeInTheDocument()
  })
})
