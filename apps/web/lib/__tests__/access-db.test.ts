import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MENU_AVAILABILITY } from '../menu-availability'

const { findUser, findModules, select } = vi.hoisted(() => ({
  findUser: vi.fn(),
  findModules: vi.fn(),
  select: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      users: { findFirst: findUser },
      modules: { findMany: findModules },
    },
    select,
  },
}))
vi.mock('@/lib/menu-availability-db', () => ({
  getMenuAvailability: vi.fn(async () => ({
    ...DEFAULT_MENU_AVAILABILITY,
    staff: { ...DEFAULT_MENU_AVAILABILITY.staff, clients: true },
  })),
}))

import { getAccessibleModules } from '../access-db'

describe('getAccessibleModules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findUser.mockResolvedValue({ id: 'abhi', username: 'Abhi', role: 'staff', isProtected: false })
    findModules.mockResolvedValue([
      { id: 'quotes', slug: 'quote-tracker', adminOnly: false, isActive: true },
      { id: 'clients', slug: 'clients', adminOnly: false, isActive: true },
      { id: 'admin', slug: 'admin', adminOnly: true, isActive: true },
    ])
  })

  it('gives a newly created staff user the enabled role tools without reading grants', async () => {
    const modules = await getAccessibleModules('abhi')
    expect(modules.map((module) => module.slug)).toEqual(['quote-tracker', 'clients'])
    expect(select).not.toHaveBeenCalled()
  })
})
