import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ source: vi.fn(), refresh: vi.fn(), status: vi.fn(), next: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/modules/work-orders/actions', () => ({ refreshDashboardWorkOrdersAction: mocks.source }))
vi.mock('../assessment-run-actions', () => ({ assessmentRunStatusAction: mocks.status, continueAssessmentRunAction: mocks.next }))
import { RefreshControl } from '../RefreshControl'
import { ProductDrafts, useProductDrafts } from '../ProductDrafts'
import { effectiveProduct } from './effective-fixtures'
beforeEach(() => { vi.clearAllMocks(); mocks.source.mockResolvedValue({ ok: true }); mocks.status.mockResolvedValue(null) })
const activeRun = { id: 'run-1', state: 'active', totalJobs: 5, completedJobs: 2, pendingJobs: 3, failedJobs: 0, unavailableJobs: 0, assessedProducts: 2, reusedProducts: 0, reviewProducts: 0 }
function RetainRemovedDraft() {
  const store = useProductDrafts(), base = effectiveProduct()
  return <button onClick={() => store.retain(base.itemId!, { base, manual: { ...base.manual, notes: 'Copy this recovered text' }, installerId: null, installerName: null, installDate: null, patches: { notes: { mode: 'staff', value: 'Copy this recovered text' } } })}>Retain removed product draft</button>
}
describe('refresh coordination with unsaved product drafts', () => {
  it('resumes assessment-only continuation after explicit discard of the last unmounted recovered draft', async () => {
    vi.useFakeTimers()
    try {
      mocks.status.mockResolvedValue(activeRun); mocks.next.mockResolvedValue({ ...activeRun, state: 'complete', pendingJobs: 0 })
      render(<ProductDrafts><RetainRemovedDraft /><RefreshControl lastSuccessfulAt={null} /></ProductDrafts>); await act(async () => {})
      fireEvent.click(screen.getByRole('button', { name: 'Retain removed product draft' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(mocks.next).not.toHaveBeenCalled()
      fireEvent.click(screen.getByText('TEST406 · Shower', { exact: true }))
      expect((screen.getByLabelText('Recoverable draft for TEST406 Shower') as HTMLTextAreaElement).value).toContain('Copy this recovered text')
      fireEvent.click(screen.getByRole('button', { name: 'Discard draft for TEST406 Shower' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(mocks.next).toHaveBeenCalledWith('run-1'); expect(mocks.source).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
  it('keeps dirty-pause feedback when a delayed initial progress lookup finishes', async () => {
    let finish!: (value: unknown) => void
    mocks.status.mockReturnValue(new Promise(resolve => { finish = resolve }))
    render(<><form data-work-order-product="product-1"><textarea aria-label="Draft" defaultValue="Keep this draft" /></form><RefreshControl lastSuccessfulAt={null} /></>)
    document.querySelector('form')!.dataset.workOrderDirty = 'true'
    fireEvent.click(screen.getByRole('button', { name: 'Refresh from ServiceM8' }))
    expect(screen.getByRole('status')).toHaveTextContent('Save or reload your product edits')
    await act(async () => finish({ ...activeRun, state: 'complete', pendingJobs: 0 }))
    expect(screen.getByRole('status')).toHaveTextContent('Save or reload your product edits')
    expect(screen.getByLabelText('Draft')).toHaveValue('Keep this draft')
    expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.next).not.toHaveBeenCalled()
  })
  it('automatically continues an active run after one click without another source refresh', async () => {
    vi.useFakeTimers()
    try {
      mocks.source.mockResolvedValue({ ok: true, run: activeRun })
      mocks.next.mockResolvedValue({ ...activeRun, state: 'complete', completedJobs: 5, pendingJobs: 0, assessedProducts: 5 })
      render(<RefreshControl lastSuccessfulAt={null} />)
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh from ServiceM8' })) })
      expect(screen.getByRole('status')).toHaveTextContent('2/5 jobs')
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(mocks.next).toHaveBeenCalledWith('run-1')
      expect(mocks.source).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('status')).toHaveTextContent('5 products assessed')
    } finally { vi.useRealTimers() }
  })
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
      mocks.source.mockResolvedValue({ ok: true, run: { ...activeRun, state: 'complete', assessedProducts: 2, reusedProducts: 1, pendingJobs: 0 } })
      render(<RefreshControl lastSuccessfulAt="2020-01-01T00:00:00Z" />)
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(mocks.source).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('status')).toHaveTextContent('2 products assessed; 1 unchanged')
      expect(mocks.refresh).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
  it('recovers after reload, pauses dirty and hidden batches, then resumes without syncing source', async () => {
    vi.useFakeTimers()
    try {
      mocks.status.mockResolvedValue(activeRun)
      mocks.next.mockResolvedValue({ ...activeRun, pendingJobs: 1, completedJobs: 4 })
      const view = render(<><form data-work-order-product="product-1"><textarea aria-label="Draft" defaultValue="Keep draft" /></form><RefreshControl lastSuccessfulAt="2020-01-01T00:00:00Z" /></>)
      await act(async () => {})
      document.querySelector('form')!.dataset.workOrderDirty = 'true'
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(mocks.next).not.toHaveBeenCalled(); expect(mocks.source).not.toHaveBeenCalled()
      expect(screen.getByRole('status')).toHaveTextContent('Assessment paused')
      document.querySelector('form')!.dataset.workOrderDirty = 'false'
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(mocks.next).not.toHaveBeenCalled()
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      await act(async () => { fireEvent(document, new Event('visibilitychange')) })
      expect(mocks.next).toHaveBeenCalledTimes(1); expect(mocks.source).not.toHaveBeenCalled()
      view.unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
      expect(mocks.next).toHaveBeenCalledTimes(1)
    } finally { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); vi.useRealTimers() }
  })
  it('finishes in-flight continuation safely while preserving a newly dirty draft', async () => {
    vi.useFakeTimers()
    try {
      mocks.status.mockResolvedValue(activeRun)
      let resolve!: (value: unknown) => void
      mocks.next.mockReturnValue(new Promise(done => { resolve = done }))
      render(<><form data-work-order-product="product-1"><textarea aria-label="Draft" defaultValue="Unsaved" /></form><RefreshControl lastSuccessfulAt={null} /></>)
      await act(async () => {}); mocks.refresh.mockClear()
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      document.querySelector('form')!.dataset.workOrderDirty = 'true'
      await act(async () => resolve({ ...activeRun, state: 'complete', pendingJobs: 0 }))
      expect(mocks.refresh).not.toHaveBeenCalled(); expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved')
    } finally { vi.useRealTimers() }
  })
  it('backs off failed continuations rather than retrying every polling tick', async () => {
    vi.useFakeTimers()
    try {
      mocks.status.mockResolvedValue(activeRun); mocks.next.mockRejectedValue(new Error('Temporary'))
      render(<RefreshControl lastSuccessfulAt={null} />); await act(async () => {})
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(mocks.next).toHaveBeenCalledTimes(1)
      await act(async () => { fireEvent(document, new Event('visibilitychange')); fireEvent(document, new Event('visibilitychange')) })
      expect(mocks.next).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(mocks.next).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(mocks.next).toHaveBeenCalledTimes(2)
    } finally { vi.useRealTimers() }
  })
  it('holds exhausted work at needs-retry until an explicit staff refresh', async () => {
    vi.useFakeTimers()
    try {
      mocks.status.mockResolvedValue({ ...activeRun, state: 'needs_retry', pendingJobs: 0, failedJobs: 1 })
      render(<RefreshControl lastSuccessfulAt="2020-01-01T00:00:00Z" />); await act(async () => {})
      await act(async () => { await vi.advanceTimersByTimeAsync(120000) })
      expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.next).not.toHaveBeenCalled()
      expect(screen.getByRole('status')).toHaveTextContent('needs retry')
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh from ServiceM8' })) })
      expect(mocks.source).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})
