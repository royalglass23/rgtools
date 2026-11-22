import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ guard: vi.fn(), roxyGuard: vi.fn(), read: vi.fn(), history: vi.fn(), changes: vi.fn(), renderRoxy: vi.fn() }))
vi.mock('@/lib/dashboard-access', () => ({ requireDashboardUser: mocks.guard, requireRoxyDashboard: mocks.roxyGuard }))
vi.mock('@/modules/job-progress/JobProgressDashboard', () => ({ JobProgressDashboard: mocks.renderRoxy }))
vi.mock('@/modules/kanban/publication-store', () => ({ readLatestPublication: mocks.read, readPublicationHistory: mocks.history, readPublicationChanges: mocks.changes }))
vi.mock('@/modules/kanban/PublishedRefreshControl', () => ({ PublishedRefreshControl: () => null }))
import RoxyPage from '../roxy/page'
import WorkOrderPage from '../work-orders/page'
beforeEach(() => vi.clearAllMocks())
describe('Dashboard pages enforce guards before source reads', () => {
  it('does not render Roxy job data for a denied direct request', async () => {
    mocks.roxyGuard.mockRejectedValue(new Error('denied'))
    await expect(RoxyPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('denied')
    expect(mocks.renderRoxy).not.toHaveBeenCalled()
  })
  it('does not query Work Orders or publication history for an anonymous request', async () => {
    mocks.guard.mockRejectedValue(new Error('login'))
    await expect(WorkOrderPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('login')
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.history).not.toHaveBeenCalled()
    expect(mocks.changes).not.toHaveBeenCalled()
  })
})
