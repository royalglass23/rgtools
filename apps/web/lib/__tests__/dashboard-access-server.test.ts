// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), storedUser: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(path) }) }))
vi.mock('react', () => ({ cache: (fn: unknown) => fn }))
vi.mock('../auth', () => ({ auth: mocks.auth }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('../db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.storedUser }) }) }) } }))
import { requireDashboardUser, requireRoxyDashboard } from '../dashboard-access'
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('ROXY_DASHBOARD_USER_ID', 'roxy-id') })
describe('server-side Dashboard authorization', () => {
  it('denies anonymous access before reading accounts', async () => {
    mocks.auth.mockResolvedValue(null)
    await expect(requireDashboardUser()).rejects.toThrow('/login')
    expect(mocks.storedUser).not.toHaveBeenCalled()
  })
  it('denies a deleted account even with a signed-in token', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'deleted', role: 'admin' } }); mocks.storedUser.mockResolvedValue([])
    await expect(requireRoxyDashboard()).rejects.toThrow('/login')
  })
  it('does not grant access from an old Admin token or a Roxy display name', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'other', role: 'admin', name: 'Roxy' } }); mocks.storedUser.mockResolvedValue([{ id: 'other', role: 'staff', username: 'Roxy' }])
    await expect(requireRoxyDashboard()).rejects.toThrow('/?denied=roxy-dashboard')
  })
  it.each([{ id: 'roxy-id', role: 'staff' }, { id: 'admin', role: 'admin' }])('permits the stored authorized account: $id', async user => {
    mocks.auth.mockResolvedValue({ user }); mocks.storedUser.mockResolvedValue([user])
    expect(await requireRoxyDashboard()).toEqual(user)
  })
})
