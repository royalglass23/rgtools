import { requireRoxyDashboard } from '@/lib/dashboard-access'
import { redirect } from 'next/navigation'
export default async function LegacyJobProgress(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRoxyDashboard()
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await props.searchParams)) {
    if (Array.isArray(value)) value.forEach(v => query.append(key, v))
    else if (value !== undefined) query.set(key, value)
  }
  redirect('/dashboard/roxy' + (query.size ? '?' + query.toString() : ''))
}
