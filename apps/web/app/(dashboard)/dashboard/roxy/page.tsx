import { requireRoxyDashboard } from '@/lib/dashboard-access'
import { JobProgressDashboard } from '@/modules/job-progress/JobProgressDashboard'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export default async function RoxyDashboard(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRoxyDashboard()
  return JobProgressDashboard({ ...props, title: 'Roxy Dashboard', basePath: '/dashboard/roxy' })
}
