import { requireModule } from '@/lib/guard'
import { StatsRefresh } from '@/modules/quote-tracker/StatsRefresh'

export default async function QuoteTrackerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireModule('quote-tracker')
  return <><StatsRefresh />{children}</>
}
