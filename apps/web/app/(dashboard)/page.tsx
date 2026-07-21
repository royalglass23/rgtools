import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardTables } from '@/modules/dashboard/config'
import { getTableMeta } from '@/modules/dashboard/tables'
import { SERVER_TABLES } from '@/modules/dashboard/registry'
import { getDashboardActionCounts, getDashboardChartData, getDashboardKpis } from '@/modules/dashboard/kpis'
import type { SparkPoint } from '@/modules/dashboard/kpis'
import { SparkLine } from '@/modules/dashboard/SparkLine'
import { ChartSection } from '@/modules/dashboard/ChartSection'
import { DismissibleNotice } from '@/modules/ui/DismissibleNotice'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const params = await searchParams
  const denied = typeof params.denied === 'string' ? params.denied : undefined
  const isAdmin = session.user.role === 'admin'

  const [actionCounts, kpis, chartData] = await Promise.all([
    getDashboardActionCounts(),
    getDashboardKpis(),
    getDashboardChartData(),
  ])

  // ── Admin-selected tables ───────────────────────────────────────────────────
  const config = await getDashboardTables()
  const sections = await Promise.all(
    config.map(async (entry) => {
      const meta = getTableMeta(entry.key)
      const server = SERVER_TABLES[entry.key]
      if (!meta || !meta.available || !server) return null
      const content = await server.render({ searchParams: params, filter: entry.filter, isAdmin })
      return { key: entry.key, label: meta.label, content }
    }),
  )
  const visibleSections = sections.filter((section) => section !== null)

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {denied !== undefined && (
        <DismissibleNotice tone="warning" noticeKey={denied}>
          You don&apos;t have access to that tool.
        </DismissibleNotice>
      )}

      {/* Business Overview + Charts — admin only */}
      {isAdmin && <BusinessOverviewSection kpis={kpis} />}
      {isAdmin && <ChartSection leadsPerWeek={chartData.leadsPerWeek} pipelineByWeek={chartData.pipelineByWeek} />}

      {/* Actions Needed */}
      <ActionsNeededSection counts={actionCounts} />

      {/* Configurable tables */}
      {visibleSections.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded px-4 py-10 text-sm text-gray-400 text-center">
          No dashboard tables selected. An admin can choose them in Dashboard Settings.
        </div>
      ) : (
        visibleSections.map((section) => (
          <section key={section.key} className="space-y-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {section.label}
            </h2>
            {section.content}
          </section>
        ))
      )}
    </div>
  )
}

type DashboardKpis = {
  pipelineValue: number
  conversionRate: number
  volumeTrend: number
  leadVolume: number
  pipelineSparkline: SparkPoint[]
  conversionSparkline: SparkPoint[]
  volumeSparkline: SparkPoint[]
}

function BusinessOverviewSection({ kpis }: { kpis: DashboardKpis }) {
  const fmtPipeline = kpis.pipelineValue >= 1_000_000
    ? `$${(kpis.pipelineValue / 1_000_000).toFixed(1)}m`
    : `$${Math.round(kpis.pipelineValue).toLocaleString('en-AU')}`

  const trendPositive = kpis.volumeTrend > 0
  const trendNeutral = kpis.volumeTrend === 0
  const trendValue = trendNeutral
    ? `${kpis.leadVolume} leads`
    : `${trendPositive ? '+' : ''}${kpis.volumeTrend}%`
  const trendSub = trendNeutral ? 'this 30 days (no prior data)' : 'vs prior 30 days'

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Business Overview</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <OverviewCard
          label="Pipeline Value"
          value={fmtPipeline}
          sub="Active hot/warm quotes"
          sparkline={kpis.pipelineSparkline}
          color="#3b82f6"
        />
        <OverviewCard
          label="Conversion Rate"
          value={`${kpis.conversionRate}%`}
          sub="Won quotes out of all closed quotes"
          sparkline={kpis.conversionSparkline}
          color="#22c55e"
        />
        <OverviewCard
          label="Lead Volume Trend"
          value={trendValue}
          sub={trendSub}
          sparkline={kpis.volumeSparkline}
          color={trendPositive ? '#22c55e' : trendNeutral ? '#6b7280' : '#ef4444'}
        />
      </div>
    </section>
  )
}

function OverviewCard({
  label,
  value,
  sub,
  sparkline,
  color,
}: {
  label: string
  value: string
  sub: string
  sparkline: SparkPoint[]
  color: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded p-5 space-y-2">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
      {sparkline.length > 0 && <SparkLine data={sparkline} color={color} />}
    </div>
  )
}

type ActionCounts = {
  staleLeads: number
  unsynced: number
  expiringSoon: number
  neverOpened: number
  forwarding: number
  goneCold: number
}

function ActionsNeededSection({ counts }: { counts: ActionCounts }) {
  const cards: Array<{ label: string; count: number; href: string }> = [
    { label: 'Tier A/B — No SM8 Job', count: counts.unsynced, href: '/leads?sm8=pending' },
    { label: 'Stale Leads (7d+)', count: counts.staleLeads, href: '/leads?stale=true' },
    { label: 'Expiring Soon', count: counts.expiringSoon, href: '/quote-tracker?activity=expiring' },
    { label: 'Never Opened', count: counts.neverOpened, href: '/quote-tracker?activity=never_opened' },
    { label: 'Forwarding Suspected', count: counts.forwarding, href: '/quote-tracker?activity=forwarding' },
    { label: 'Gone Cold (14d+)', count: counts.goneCold, href: '/quote-tracker?activity=gone_cold' },
  ]

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions Needed</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, count, href }) => (
          <ActionCard key={label} label={label} count={count} href={href} />
        ))}
      </div>
    </section>
  )
}

function ActionCard({ label, count, href }: { label: string; count: number; href: string }) {
  const hasAction = count > 0
  return (
    <Link
      href={href}
      className={`block rounded border p-5 transition-colors ${
        hasAction
          ? 'border-orange-200 bg-orange-50 hover:bg-orange-100'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <div className={`mb-1 text-2xl font-semibold ${hasAction ? 'text-orange-700' : 'text-gray-400'}`}>
        {count}
      </div>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
    </Link>
  )
}
