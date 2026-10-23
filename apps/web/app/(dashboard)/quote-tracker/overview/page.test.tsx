import { fireEvent, render, screen, within } from '@testing-library/react'
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
import { QUOTE_PROGRESS_GROUPS } from '@/modules/quote-tracker/quote-progress'

const event = {
  id: 'event-1', quoteId: 'quote-1', clientName: 'Ada', workOrderId: 'Q100',
  jobAddress: '12 Glass Street', eventType: 'open', createdAt: new Date('2026-10-22T02:00:00Z'),
  engagementPreview: { totalOpens: 3, uniqueSessions: 2, totalTimeMs: 250_000, maxScrollDepth: 100, forwardingSuspected: true, interestScore: 75 },
}
const attentionQuote = {
  id: 'quote-2', clientName: 'Lee', workOrderId: 'Q200',
  jobAddress: '34 Window Road',
  reasons: ['No opens yet'], lastOpenedAt: null,
  engagementPreview: { totalOpens: 0, uniqueSessions: 0, totalTimeMs: 0, maxScrollDepth: 0, forwardingSuspected: false, interestScore: 0 },
}

function result() {
  return {
    asOf: new Date('2026-10-22T03:00:00Z'),
    progress: QUOTE_PROGRESS_GROUPS.map(({ id }) => ({ id, count: id === 'overdue' ? 5 : 0, totalValue: '1200.50' })),
    snapshot: { activeLinks: 12, totalValue: '1200.50', hotCount: 1, warmCount: 2, coldCount: 4, unopenedAfterThreeDays: 5, forwardingCount: 1, viewedCount: 3 },
    activity: { rows: [event], total: 12, page: 1, size: 5, pageCount: 3, offset: 0 },
    attention: { rows: [attentionQuote], total: 6, page: 1, size: 5, pageCount: 2, offset: 0 },
  }
}

const page = (params: Record<string, string> = {}) => TrackedQuoteOverviewPage({ searchParams: Promise.resolve(params) })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('TrackedQuoteOverviewPage', () => {
  it('shows compact amounts, shorter labels and six bar destinations for the selected period', async () => {
    const data = result()
    data.snapshot.totalValue = '1699999.99'
    getTrackedQuoteOverview.mockResolvedValueOnce(data)
    render(await page({ trackedIn: '14' }))
    const snapshot = screen.getByRole('region', { name: 'Tracked link snapshot' })
    expect(within(snapshot).getByText('$1.6m+')).toBeInTheDocument()
    expect(within(snapshot).getByRole('link', { name: /Total value/ })).toHaveAccessibleDescription('Exact value: $1,699,999.99')
    expect(within(snapshot).getByText('Active links')).toBeInTheDocument()
    expect(within(snapshot).getByText('Forwarded')).toBeInTheDocument()
    const progress = screen.getByRole('region', { name: 'Quote progress' })
    expect(within(progress).getAllByRole('link')).toHaveLength(6)
    expect(within(progress).getByRole('link', { name: /Unopened — under 3 days/ })).toHaveAttribute('href', '/quote-tracker?trackedIn=14&linkStatus=active&outcome=open&activity=unopened_under_3_days')
    expect(within(progress).getByRole('link', { name: /Opened multiple times/ })).toHaveAttribute('href', '/quote-tracker?trackedIn=14&linkStatus=active&outcome=open&activity=opened_multiple')
    expect(within(progress).getByRole('link', { name: /Won:/ })).toHaveAttribute('href', '/quote-tracker?trackedIn=14&linkStatus=all&outcome=won')
    expect(within(progress).getByRole('link', { name: /Lost:/ })).toHaveAccessibleDescription('$1,200.50 · Confirmed outcome')
  })
  it('checks the Quote Tracker grant before reading engagement data', async () => {
    requireModule.mockRejectedValueOnce(new Error('denied'))
    await expect(page()).rejects.toThrow('denied')
    expect(requireModule).toHaveBeenCalledWith('quote-tracker')
    expect(getTrackedQuoteOverview).not.toHaveBeenCalled()
  })

  it('shows scoped clickable metrics, linked entries, and independent five-row pagination', async () => {
    getTrackedQuoteOverview.mockResolvedValueOnce(result())
    render(await page())

    expect(getTrackedQuoteOverview).toHaveBeenCalledWith({
      activity: { page: 1, size: 5 }, attention: { page: 1, size: 5 },
    }, '30')
    const snapshot = screen.getByRole('region', { name: 'Tracked link snapshot' })
    const attentionHeading = screen.getByRole('heading', { name: 'Needs attention' })
    const activityHeading = screen.getByRole('heading', { name: 'Recent activity' })
    expect(snapshot.compareDocumentPosition(attentionHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(attentionHeading.compareDocumentPosition(activityHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Quotes tracked in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Last 30 days' })).toHaveAttribute('aria-current', 'page')
    expect(within(snapshot).getByRole('link', { name: /Total value/ })).toHaveAttribute('href', '/quote-tracker?trackedIn=30&linkStatus=active&outcome=open')
    expect(within(snapshot).getByRole('link', { name: /Hot quotes/ })).toHaveAttribute('href', '/quote-tracker?trackedIn=30&linkStatus=active&outcome=open&status=hot')
    expect(within(snapshot).getByRole('link', { name: /Unopened:/ })).toHaveAttribute('href', '/quote-tracker?trackedIn=30&linkStatus=active&outcome=open&activity=unopened_3_days')
    expect(screen.getByRole('link', { name: /Q100 · Ada/ })).toHaveAttribute('href', '/quote-tracker/quote-1')
    expect(screen.getByText('12 Glass Street')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Q200 · Lee/ })).toHaveAttribute('href', '/quote-tracker/quote-2')
    expect(within(screen.getByRole('link', { name: /Q200 · Lee/ })).getByText('34 Window Road')).toBeInTheDocument()
    const activityPreview = screen.getByRole('link', { name: /Q100 · Ada/ }).closest('li')!
    expect(within(activityPreview).getByRole('heading', { name: 'Engagement' })).toBeInTheDocument()
    expect(within(activityPreview).getByText('4m 10s')).toBeInTheDocument()
    expect(within(activityPreview).getByText('Suspected')).toBeInTheDocument()
    expect(within(activityPreview).getByRole('progressbar', { name: 'Interest score' })).toHaveAttribute('aria-valuenow', '75')
    const attentionPreview = screen.getByRole('link', { name: /Q200 · Lee/ }).closest('li')!
    expect(within(attentionPreview).getByText('No signal')).toBeInTheDocument()
    expect(screen.getByText('Each line is an event, not a unique viewer or a confirmed sale.')).toBeInTheDocument()

    const activityPages = screen.getByRole('navigation', { name: 'Recent activity pages' })
    expect(within(activityPages).getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/quote-tracker/overview?activityPage=2&activitySize=5&attentionPage=1&attentionSize=5&trackedIn=30')
    const attentionPages = screen.getByRole('navigation', { name: 'Needs attention pages' })
    expect(within(attentionPages).getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/quote-tracker/overview?activityPage=1&activitySize=5&attentionPage=2&attentionSize=5&trackedIn=30')
    const activitySize = within(activityHeading.closest('details')!).getByRole('combobox', { name: 'Page size' })
    const attentionSize = within(attentionHeading.closest('details')!).getByRole('combobox', { name: 'Page size' })
    expect(activitySize).toHaveValue('5')
    expect(attentionSize).toHaveValue('5')
    expect(within(activitySize).getAllByRole('option').map((option) => option.textContent)).toEqual(['5', '10', '20', '50'])
  })

  it('shows prominent section summaries and lets each list collapse independently', async () => {
    getTrackedQuoteOverview.mockResolvedValueOnce(result())
    render(await page())

    const activity = screen.getByRole('heading', { name: 'Recent activity' }).closest('details')
    const attention = screen.getByRole('heading', { name: 'Needs attention' }).closest('details')
    expect(activity).toHaveAttribute('open')
    expect(attention).toHaveAttribute('open')
    expect(within(activity!.querySelector('summary')!).getByText('12 events')).toBeInTheDocument()
    expect(within(attention!.querySelector('summary')!).getByText('6 quotes')).toBeInTheDocument()

    fireEvent.click(activity!.querySelector('summary')!)
    expect(activity).not.toHaveAttribute('open')
    expect(attention).toHaveAttribute('open')

    fireEvent.click(attention!.querySelector('summary')!)
    expect(attention).not.toHaveAttribute('open')
    fireEvent.click(activity!.querySelector('summary')!)
    expect(activity).toHaveAttribute('open')
  })

  it('passes chosen pages and sizes to the query and preserves the other list in navigation', async () => {
    const data = result()
    data.activity = { ...data.activity, page: 2, size: 10, pageCount: 2, offset: 10 }
    data.attention = { ...data.attention, page: 3, size: 20, pageCount: 3, offset: 40 }
    getTrackedQuoteOverview.mockResolvedValueOnce(data)
    render(await page({ activityPage: '2', activitySize: '10', attentionPage: '3', attentionSize: '20', trackedIn: '14' }))

    expect(getTrackedQuoteOverview).toHaveBeenCalledWith({
      activity: { page: 2, size: 10 }, attention: { page: 3, size: 20 },
    }, '14')
    expect(within(screen.getByRole('navigation', { name: 'Recent activity pages' })).getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/quote-tracker/overview?activityPage=1&activitySize=10&attentionPage=3&attentionSize=20&trackedIn=14')
    const activityForm = within(screen.getByRole('heading', { name: 'Recent activity' }).closest('details')!).getByRole('combobox', { name: 'Page size' }).closest('form')
    expect(activityForm?.querySelector('input[name="attentionPage"]')).toHaveValue('3')
    expect(activityForm?.querySelector('input[name="attentionSize"]')).toHaveValue('20')
    expect(activityForm?.querySelector('input[name="activityPage"]')).toHaveValue('1')
    expect(activityForm?.querySelector('input[name="trackedIn"]')).toHaveValue('14')
    expect(screen.getByRole('link', { name: 'All time' })).toHaveAttribute('href', '/quote-tracker/overview?trackedIn=all&activitySize=10&attentionSize=20')
  })

  it('explains when there is no recorded activity', async () => {
    const data = result()
    data.snapshot = { activeLinks: 0, totalValue: '0', hotCount: 0, warmCount: 0, coldCount: 0, unopenedAfterThreeDays: 0, forwardingCount: 0, viewedCount: 0 }
    data.activity = { rows: [], total: 0, page: 1, size: 5, pageCount: 1, offset: 0 }
    data.attention = { rows: [], total: 0, page: 1, size: 5, pageCount: 1, offset: 0 }
    data.progress = data.progress.map((bucket) => ({ ...bucket, count: 0, totalValue: '0' }))
    getTrackedQuoteOverview.mockResolvedValueOnce(data)

    render(await page())
    expect(screen.getByText(/No quote opens, downloads, or action clicks/)).toBeInTheDocument()
    expect(screen.getByText(/No active tracked quotes currently match/)).toBeInTheDocument()
    expect(screen.getByText('No tracked quotes match this period and scope.')).toBeInTheDocument()
  })
})
