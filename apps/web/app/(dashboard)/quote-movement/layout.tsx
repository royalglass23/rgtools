import { requireModule } from '@/lib/guard'

export default async function QuoteMovementLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireModule('quote-tracker')
  return <>{children}</>
}
