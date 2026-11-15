import type { DashboardNavItem } from './admin-navigation'
export function sharedDashboardItems(canViewRoxy: boolean, canViewQuotes: boolean): DashboardNavItem[] {
  return [
    ...(canViewRoxy ? [{ id: 'roxy-dashboard', slug: 'dashboard/roxy', name: 'Roxy Dashboard', href: '/dashboard/roxy' }] : []),
    ...(canViewQuotes ? [{ id: 'quote-dashboard', slug: 'dashboard/quotes', name: 'Quote tracking', href: '/dashboard/quotes' }] : []),
    { id: 'work-order-dashboard', slug: 'dashboard/work-orders', name: 'Work Orders', href: '/dashboard/work-orders' },
  ]
}
