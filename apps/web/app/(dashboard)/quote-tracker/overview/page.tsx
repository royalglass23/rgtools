import { redirect } from 'next/navigation'
import { requireModule } from '@/lib/guard'
export default async function QuoteOverviewRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModule('quote-tracker')
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(v => query.append(key, v))
    else if (value !== undefined) query.set(key, value)
  }
  redirect('/dashboard/quotes' + (query.size ? '?' + query.toString() : ''))
}
