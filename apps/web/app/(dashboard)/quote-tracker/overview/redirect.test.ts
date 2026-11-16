// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ guard: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(url) }) }))
vi.mock('@/lib/guard', () => ({ requireModule: mocks.guard }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
import Page from './page'
describe('legacy quote overview URL', () => {
  it('retains filter, independent paging and repeated query parameters', async () => {
    await expect(Page({ searchParams: Promise.resolve({ trackedIn: '14', activityPage: '2', tag: ['one', 'two'] }) })).rejects.toThrow('/dashboard/quotes?trackedIn=14&activityPage=2&tag=one&tag=two')
    expect(mocks.guard).toHaveBeenCalledWith('quote-tracker')
  })
})
