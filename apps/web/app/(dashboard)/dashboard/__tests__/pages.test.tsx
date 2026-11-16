import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ guard: vi.fn(), roxyGuard: vi.fn(), read: vi.fn(), renderRoxy: vi.fn() }))
vi.mock('@/lib/dashboard-access', () => ({ requireDashboardUser: mocks.guard, requireRoxyDashboard: mocks.roxyGuard }))
vi.mock('@/modules/job-progress/JobProgressDashboard', () => ({ JobProgressDashboard: mocks.renderRoxy }))
vi.mock('@/modules/kanban/persistence', () => ({ readWorkOrderDashboard: mocks.read }))
vi.mock('@/modules/kanban/ProductEditor', () => ({ ProductEditor: () => null }))
vi.mock('@/modules/kanban/RefreshControl', () => ({ RefreshControl: () => null }))
vi.mock('@/modules/work-orders/queries', () => ({ getWorkOrderRefreshStatus: vi.fn() }))
import RoxyPage from '../roxy/page'
import WorkOrderPage from '../work-orders/page'
beforeEach(() => vi.clearAllMocks())
describe('Dashboard pages enforce guards before source reads', () => {
  it('does not render Roxy job data for a denied direct request', async () => {
    mocks.roxyGuard.mockRejectedValue(new Error('denied'))
    await expect(RoxyPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('denied')
    expect(mocks.renderRoxy).not.toHaveBeenCalled()
  })
  it('does not query Work Orders for an anonymous request', async () => {
    mocks.guard.mockRejectedValue(new Error('login'))
    await expect(WorkOrderPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('login')
    expect(mocks.read).not.toHaveBeenCalled()
  })
})
