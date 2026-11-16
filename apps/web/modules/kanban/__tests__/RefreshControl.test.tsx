import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ source: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/modules/work-orders/actions', () => ({ refreshDashboardWorkOrdersAction: mocks.source }))
import { RefreshControl } from '../RefreshControl'
beforeEach(() => { vi.clearAllMocks(); mocks.source.mockResolvedValue({ ok: true }) })
describe('refresh coordination with unsaved product drafts', () => {
  it('keeps a dirty row mounted even when refresh would remove it from the current result', async () => {
    render(<><form data-work-order-product="product-1" data-work-order-dirty="true"><textarea aria-label="Draft" defaultValue="Keep this unsaved text" /></form><RefreshControl lastSuccessfulAt={null} /></>)
    mocks.refresh.mockImplementation(() => document.querySelector('form')?.remove())
    fireEvent.click(screen.getByRole('button', { name: 'Refresh from ServiceM8' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Save or reload'))
    expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep this unsaved text')
    mocks.refresh.mockReset()
  })
  it('defers rerender if editing starts while the source request is in flight', async () => {
    let finish!: (result: { ok: boolean }) => void
    mocks.source.mockReturnValue(new Promise(resolve => { finish = resolve }))
    render(<><form data-work-order-product="product-1"><textarea aria-label="Draft" defaultValue="Started during refresh" /></form><RefreshControl lastSuccessfulAt={null} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh from ServiceM8' }))
    document.querySelector('form')!.dataset.workOrderDirty = 'true'
    await act(async () => finish({ ok: true }))
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Save or reload your edits')
    expect(screen.getByLabelText('Draft')).toHaveValue('Started during refresh')
  })
  it('uses the same assessment-capable refresh action for a visible stale dashboard', async () => {
    vi.useFakeTimers()
    try {
      mocks.source.mockResolvedValue({ ok: true, assessment: { assessedProducts: 2, reusedProducts: 1, pendingJobs: 0, failedJobs: 0, unavailable: false } })
      render(<RefreshControl lastSuccessfulAt="2020-01-01T00:00:00Z" />)
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(mocks.source).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('status')).toHaveTextContent('2 products assessed; 1 unchanged')
      expect(mocks.refresh).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})
