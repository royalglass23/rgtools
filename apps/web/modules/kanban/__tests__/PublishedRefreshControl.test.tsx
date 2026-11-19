import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), fetch: vi.fn(), version: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/dashboard-access', () => ({ requireDashboardUser: mocks.auth }))
vi.mock('../publication-store', () => ({ readPublicationVersion: mocks.version }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
import { PublishedRefreshControl } from '../PublishedRefreshControl'
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.stubGlobal('fetch', mocks.fetch); mocks.auth.mockResolvedValue({ id: 'staff' }); vi.stubEnv('KANBAN_BOT_WEBHOOK_URL', 'https://bot.example.test/refresh'); vi.stubEnv('KANBAN_BOT_WEBHOOK_SECRET', 'fictional-trigger'); mocks.version.mockResolvedValue('first') })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('request acknowledgement and publication freshness', () => {
  it('guards only dispatch, acknowledges acceptance and does not poll completion or repeat POST', async () => {
    let release!: (value: Response) => void
    mocks.fetch.mockReturnValue(new Promise(resolve => { release = resolve }))
    render(<PublishedRefreshControl publicationId="first" />)
    fireEvent.click(screen.getByRole('button', { name: 'Request update' })); expect(screen.getByRole('button')).toBeDisabled()
    await act(async () => { release(new Response('', { status: 200 })) })
    expect(screen.getByRole('button', { name: 'Request update' })).toBeEnabled(); expect(screen.getByRole('status')).toHaveTextContent('Update requested')
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.fetch).toHaveBeenCalledOnce(); expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it('checks only visible tabs and reloads when the stored publication changes', async () => {
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const view = render(<PublishedRefreshControl publicationId="first" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) }); expect(mocks.version).not.toHaveBeenCalled()
    visible.mockReturnValue('visible'); mocks.version.mockResolvedValue('second')
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) }); expect(mocks.refresh).toHaveBeenCalledOnce(); expect(mocks.fetch).not.toHaveBeenCalled()
    view.rerender(<PublishedRefreshControl publicationId="second" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) }); expect(mocks.refresh).toHaveBeenCalledOnce()
    visible.mockRestore()
  })
  it('keeps checking after a refresh fails to deliver the new page props', async () => {
    render(<PublishedRefreshControl publicationId="first" />)
    mocks.version.mockResolvedValue('second'); mocks.refresh.mockImplementationOnce(() => { throw new Error('fictional refresh failure') })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(mocks.refresh).toHaveBeenCalledTimes(2); expect(mocks.version).toHaveBeenCalledTimes(2); expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
