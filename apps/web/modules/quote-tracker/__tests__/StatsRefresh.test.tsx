import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatsRefresh } from '../StatsRefresh'

const refresh = vi.hoisted(() => vi.fn())
const router = vi.hoisted(() => ({ refresh }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

beforeEach(() => {
  vi.useFakeTimers()
  refresh.mockClear()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Quote Tracker stats refresh', () => {
  it('refreshes visible stats periodically without navigating to details and cleans up on leave', () => {
    const view = render(<StatsRefresh />)
    refresh.mockClear()
    act(() => vi.advanceTimersByTime(30000))
    expect(refresh).toHaveBeenCalledTimes(1)
    view.unmount()
    act(() => vi.advanceTimersByTime(60000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('pauses while hidden and refreshes when returning to the tab', () => {
    render(<StatsRefresh />)
    refresh.mockClear()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => vi.advanceTimersByTime(60000))
    expect(refresh).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    fireEvent(window, new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh over an active form edit', () => {
    const view = render(<><StatsRefresh /><input aria-label="Edit" /></>)
    refresh.mockClear()
    const input = view.getByRole('textbox')
    input.focus()
    act(() => vi.advanceTimersByTime(30000))
    expect(refresh).not.toHaveBeenCalled()
    input.blur()
    act(() => vi.advanceTimersByTime(30000))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
