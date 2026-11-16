import { describe, expect, it } from 'vitest'
import { sharedDashboardItems } from '../dashboard-navigation'
describe('shared Dashboard submenu', () => {
  it('keeps Work Orders for all staff but hides Roxy and unavailable Quotes', () => {
    expect(sharedDashboardItems(false, false).map(i => i.href)).toEqual(['/dashboard/work-orders'])
    expect(sharedDashboardItems(false, true).map(i => i.href)).toEqual(['/dashboard/quotes', '/dashboard/work-orders'])
    expect(sharedDashboardItems(true, true).map(i => i.href)).toEqual(['/dashboard/roxy', '/dashboard/quotes', '/dashboard/work-orders'])
  })
})
