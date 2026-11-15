export type DashboardUser = { id: string; role: 'admin' | 'staff' }

export function canViewRoxyDashboard(user: DashboardUser | null, roxyUserId?: string) {
  return Boolean(user && (user.role === 'admin' || (roxyUserId?.trim() && user.id === roxyUserId.trim())))
}
