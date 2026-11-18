import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ start: vi.fn(), status: vi.fn(), refresh: vi.fn() }))
vi.mock('../bot-refresh', () => ({ startPublishedRefresh: mocks.start, publishedRefreshStatus: mocks.status }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
import { PublishedRefreshControl } from '../PublishedRefreshControl'

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); mocks.start.mockResolvedValue({ ok: true, requestId: 'fictional-id' }); mocks.status.mockResolvedValue({ state: 'pending' }) })
afterEach(() => vi.useRealTimers())

describe('published refresh control', () => {
  it('does not trigger on mount; one click waits for completion and guards in-flight clicks', async () => {
    render(<PublishedRefreshControl />)
    expect(mocks.start).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: 'Refresh' })
    await act(async () => { fireEvent.click(button); fireEvent.click(button) })
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(button).toBeDisabled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(screen.getByRole('status')).toHaveTextContent('Current published rows remain visible')
    expect(mocks.refresh).not.toHaveBeenCalled()
    mocks.status.mockResolvedValue({ state: 'complete', changed: false })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('no changes')
    expect(button).not.toBeDisabled()
  })
  it('preserves the current view on failure and never automatically retriggers', async () => {
    mocks.status.mockResolvedValue({ state: 'failed', error: 'Kanban failed. Current rows remain visible.' })
    render(<PublishedRefreshControl />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh' })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(screen.getByRole('status')).toHaveTextContent('Kanban failed')
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.start).toHaveBeenCalledOnce()
  })
  it('bounds polling and reports unconfirmed completion without clearing or reloading rows', async () => {
    render(<PublishedRefreshControl />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh' })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(310_000) })
    expect(screen.getByRole('status')).toHaveTextContent('completion is not yet confirmed')
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.start).toHaveBeenCalledOnce()
  })
  it('does not poll after unmount', async () => {
    const view = render(<PublishedRefreshControl />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh' })) })
    view.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(mocks.status).not.toHaveBeenCalled()
  })
})
