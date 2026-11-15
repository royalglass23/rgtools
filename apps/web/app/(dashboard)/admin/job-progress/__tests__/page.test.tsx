// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ guard: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(url) }) }))
vi.mock('@/lib/dashboard-access', () => ({ requireRoxyDashboard: mocks.guard }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
import Page from '../page'
beforeEach(() => vi.clearAllMocks())
describe('legacy Roxy Dashboard URL', () => {
  it('keeps filters while redirecting an authorized user', async () => {
    await expect(Page({ searchParams: Promise.resolve({ days: '30', view: 'upcoming', q: 'site' }) })).rejects.toThrow('/dashboard/roxy?days=30&view=upcoming&q=site')
    expect(mocks.guard).toHaveBeenCalled()
  })
  it('does not redirect a denied user to a data view', async () => {
    mocks.guard.mockRejectedValueOnce(new Error('denied'))
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('denied')
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
