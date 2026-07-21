import Link from 'next/link'
import { auth } from '@/lib/auth'
import { LeadsTableControls } from '@/modules/leads/LeadsTableControls'
import { ImportServiceM8LeadForm } from '@/modules/leads/ImportServiceM8LeadForm'
import { getLeadsList, parseLeadsListFilters } from '@/modules/leads/queries'
import { loadTablePrefs } from '@/modules/leads/table-prefs'
import { DEFAULT_LEADS_PREFS } from '@/modules/leads/table-prefs-shared'
import { importServiceM8LeadAction } from './actions'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const session = await auth()
  const prefs = session?.user?.id
    ? await loadTablePrefs(session.user.id, 'leads')
    : DEFAULT_LEADS_PREFS
  const isAdmin = session?.user?.role === 'admin'
  const filters = parseLeadsListFilters(params, {
    defaults: {
      sortColumn: prefs.sortColumn,
      sortDir: prefs.sortDir,
    },
    isAdmin,
  })
  const { rows, total, pageCount } = await getLeadsList(filters, filters, { isAdmin })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-950">Leads</h1>
        <div className="flex flex-wrap items-end gap-3">
          <ImportServiceM8LeadForm action={importServiceM8LeadAction} />
          <Link
            href="/lead-intake"
            className="rounded bg-[#142B3A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1d3d52]"
          >
            New Lead
          </Link>
        </div>
      </div>

      <LeadsTableControls
        filters={filters}
        rows={rows}
        total={total}
        pageCount={pageCount}
        isAdmin={isAdmin}
        prefs={prefs}
      />
    </div>
  )
}
