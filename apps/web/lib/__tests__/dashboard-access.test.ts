import { describe, expect, it } from 'vitest'
import { canViewRoxyDashboard } from '../dashboard-policy'

describe('Roxy Dashboard policy', () => {
  it('allows Admin or the configured stable Roxy user ID only', () => {
    expect(canViewRoxyDashboard({ id: 'a', role: 'admin' }, undefined)).toBe(true)
    expect(canViewRoxyDashboard({ id: 'roxy-id', role: 'staff' }, 'roxy-id')).toBe(true)
    expect(canViewRoxyDashboard({ id: 'other', role: 'staff' }, 'roxy-id')).toBe(false)
    expect(canViewRoxyDashboard({ id: 'roxy', role: 'staff' }, undefined)).toBe(false)
    expect(canViewRoxyDashboard(null, 'roxy-id')).toBe(false)
  })
})
