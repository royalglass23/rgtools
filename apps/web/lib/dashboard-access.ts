import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { auth } from './auth'
import { db } from './db'
import { users } from '@rgtools/db/schema'
import { canViewRoxyDashboard } from './dashboard-policy'

// Recheck the stored account/role rather than trusting a stale JWT role.
export const getDashboardUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null
  const [user] = await db.select({ id: users.id, username: users.username, role: users.role })
    .from(users).where(eq(users.id, session.user.id)).limit(1)
  return user ?? null
})

export async function requireDashboardUser() {
  const user = await getDashboardUser()
  if (!user) redirect('/login')
  return user
}

export async function requireRoxyDashboard() {
  const user = await requireDashboardUser()
  if (!canViewRoxyDashboard(user, process.env.ROXY_DASHBOARD_USER_ID)) redirect('/?denied=roxy-dashboard')
  return user
}
