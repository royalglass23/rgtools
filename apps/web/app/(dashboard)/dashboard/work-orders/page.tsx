import Link from 'next/link'
import { Fragment } from 'react'
import { requireDashboardUser } from '@/lib/dashboard-access'
import { PageHeader, DataPanel, TableShell, FeedbackState, StatusBadge } from '@/components/precision-ui/PrecisionUI'
import { PaginationBar } from '@/components/pagination/PaginationBar'
import { readWorkOrderDashboard } from '@/modules/kanban/persistence'
import { DASHBOARD_PAGE_SIZES, dashboardPageSize, FOCUS_LABELS, READINESS_LABELS, withinThreeWeeks, type Focus, type Readiness } from '@/modules/kanban/work-orders'
import { ProductEditor } from '@/modules/kanban/ProductEditor'
import { RefreshControl } from '@/modules/kanban/RefreshControl'
import { MaterialDescription } from '@/modules/kanban/MaterialDescription'
import { shortMaterialDescription } from '@/modules/kanban/material-description'
import { getWorkOrderRefreshStatus } from '@/modules/work-orders/queries'
import styles from '@/modules/kanban/WorkOrderDashboard.module.css'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
type Params = Record<string, string | string[] | undefined>
const value = (p: Params, key: string) => typeof p[key] === 'string' ? p[key] as string : ''
const pageNumber = (p: Params, key: string) => Math.max(1, Math.min(10000, Number.parseInt(value(p, key), 10) || 1))
const focusChoices = { all: 'All products', upcoming: 'Due within 3 weeks', overdue: 'Overdue', unknown: 'Unknown', conflict: 'Review conflicts' }
function date(value: string | null) { return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : 'TBC' }
function ReadinessValue({ state }: { state: Readiness }) {
  return <span title={state === 'unknown' ? 'Unknown' : state === 'na' ? 'Not applicable' : state === 'yes' ? 'Yes' : 'No'}>{READINESS_LABELS[state]}</span>
}

export default async function WorkOrderDashboard({ searchParams }: { searchParams: Promise<Params> }) {
  await requireDashboardUser()
  const p = await searchParams
  const q = value(p, 'q').trim().slice(0, 100)
  const focus = Object.hasOwn(focusChoices, value(p, 'focus')) ? value(p, 'focus') as keyof typeof focusChoices : 'upcoming'
  let data, status
  try { [data, status] = await Promise.all([readWorkOrderDashboard(q), getWorkOrderRefreshStatus()]) }
  catch { return <><PageHeader title="Work Orders dashboard" /><FeedbackState tone="error">Work Order records could not load. Reload the page or ask an administrator to check the dashboard migration.</FeedbackState></> }
  const products = data.rows.filter(row => row.itemId)
  const failedAssessments = products.filter(row => row.assessment?.state === 'failed').length
  const jobs = Array.from(new Map(data.rows.map(row => [row.jobId, row])).values())
  const focused = products.filter(row => focus === 'all' || (focus === 'upcoming' ? row.inDueWindow : row.focus === focus))
  const jobsSize = dashboardPageSize(value(p, 'jobsSize')); const itemsSize = dashboardPageSize(value(p, 'itemsSize'))
  const jobPages = Math.max(1, Math.ceil(jobs.length / jobsSize)); const jp = Math.min(pageNumber(p, 'jobsPage'), jobPages)
  const productPages = Math.max(1, Math.ceil(focused.length / itemsSize))
  const targetIndex = focused.findIndex(row => row.itemId === value(p, 'product'))
  const ip = targetIndex >= 0 ? Math.floor(targetIndex / itemsSize) + 1 : Math.min(pageNumber(p, 'itemsPage'), productPages)
  const current = { q, focus, jobsPage: String(jp), jobsSize: String(jobsSize), itemsPage: String(ip), itemsSize: String(itemsSize) }
  function href(update: Record<string, string>) { return `/dashboard/work-orders?${new URLSearchParams({ ...current, ...update })}` }
  function pagination(kind: 'jobs' | 'items', total: number, page: number, pageCount: number, size: number) {
    const key = `${kind}Page`; const sizeKey = `${kind}Size`
    return <PaginationBar count={`${total} ${kind === 'jobs' ? 'work orders' : 'products'}`} page={page} pageCount={pageCount}
      label={kind === 'jobs' ? 'Work Order pages' : 'Product pages'}
      previous={page > 1 ? <Link href={href({ [key]: String(page - 1) })}>Previous</Link> : <span aria-disabled="true">Previous</span>}
      next={page < pageCount ? <Link href={href({ [key]: String(page + 1) })}>Next</Link> : <span aria-disabled="true">Next</span>}
      pageSize={<form action="/dashboard/work-orders" method="get">
        {Object.entries(current).filter(([name]) => name !== sizeKey).map(([name, val]) => <input key={name} type="hidden" name={name} value={name === key ? '1' : val} />)}
        <label htmlFor={`${kind}-page-size`}>Page size</label>
        <select id={`${kind}-page-size`} name={sizeKey} defaultValue={String(size)}>{DASHBOARD_PAGE_SIZES.map(option => <option key={option} value={option}>{option}</option>)}</select>
        <button type="submit">Apply</button>
      </form>} />
  }
  const count = (key: Focus) => products.filter(row => row.focus === key).length
  return <div className={styles.page}>
    <PageHeader title="Work Orders dashboard" description="Plan each product, record readiness and see what needs attention." actions={<RefreshControl lastSuccessfulAt={status.lastSuccessfulAt?.toISOString() ?? null} />} />
    <p className={styles.source}>ServiceM8 source refreshed: {status.lastSuccessfulAt ? status.lastSuccessfulAt.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }) : 'Not yet refreshed'}. Staff edits save immediately in RG Tools. Dates use Auckland time.</p>
    {status.latestFailure && <FeedbackState tone="error">The latest ServiceM8 refresh failed. Previous saved records are shown.</FeedbackState>}
    {data.flagsUnavailable && <FeedbackState tone="error">Imported Kanban flags could not load. Product overrides still apply; automatic inclusion waits for an administrator to check the saved flags.</FeedbackState>}
    <form method="get" className={styles.toolbar} action="/dashboard/work-orders">
      <label>Find a job or product<input name="q" type="search" defaultValue={q} placeholder="Job, customer, site or product" maxLength={100} /></label>
      <input type="hidden" name="focus" value={focus} /><input type="hidden" name="jobsSize" value={jobsSize} /><input type="hidden" name="itemsSize" value={itemsSize} /><button type="submit">Search</button>
      {q && <Link href="/dashboard/work-orders">Clear search</Link>}
    </form>
    <p className={styles.counts}><strong>{jobs.length}</strong> matching jobs · <strong>{products.length}</strong> products · {count('overdue')} overdue · {count('unknown')} unknown · {count('conflict')} conflicts</p>
    {failedAssessments > 0 && <FeedbackState tone="error">Due-date assessment failed for {failedAssessments} {failedAssessments === 1 ? 'product' : 'products'}. Use Refresh from ServiceM8 to retry. Open All products, then Detected planning evidence for details. Saved staff dates and manual choices still apply.</FeedbackState>}
    <DataPanel title="Table A - All Work Orders">
      {jobs.length === 0 ? <FeedbackState tone="empty">No saved Work Orders match this search. Clear the search or refresh from ServiceM8.</FeedbackState> : <TableShell label="All Work Order rows"><table className={styles.table}>
        <thead><tr>{['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?'].map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{jobs.slice((jp - 1) * jobsSize, jp * jobsSize).map(job => {
          const jobProducts = products.filter(row => row.jobId === job.jobId)
          const window = jobProducts.length ? (jobProducts.some(row => row.inDueWindow) ? 'Y' : jobProducts.some(row => row.focus === 'conflict' && row.manual.focus === 'auto' && !row.kanbanFlag) ? 'Review' : jobProducts.some(row => row.focus === 'unknown') ? '?' : 'N') : job.kanbanFlag?.flag ?? withinThreeWeeks([], job.jobInstallDate, data.today)
          const candidateDates = [...new Set(jobProducts.flatMap(row => row.planningDate ? [row.planningDate] : []))]
          const approximateDate = job.jobInstallDate ?? (candidateDates.length === 1 ? candidateDates[0] : null)
          return <tr key={job.jobId}>
            <td>{job.jobUuid ? <a href={`https://go.servicem8.com/OpenJob/${encodeURIComponent(job.jobUuid)}`} target="_blank" rel="noreferrer">{job.jobNumber ?? 'Unnumbered job'}</a> : job.jobNumber}</td>
            <td>{job.customer}</td><td>{job.address ?? 'Address unknown'}</td>
            <td>{date(approximateDate)}<div className={styles.source}>{job.jobInstallDate ? 'Job target; products may differ' : candidateDates.length ? 'Product targets / suggestions; check each product' : 'No supported target date'}</div></td>
            <td><StatusBadge tone={window === 'Review' ? 'warning' : 'muted'}>{window}</StatusBadge></td>
          </tr>
        })}</tbody>
      </table></TableShell>}
      {pagination('jobs', jobs.length, jp, jobPages, jobsSize)}
    </DataPanel>
    <DataPanel title="Table B - Due within 3 weeks">
      <p className={styles.source}>One row per product. Product Include/Exclude/Needs review overrides the imported Master Y/N/? job flag. Where no flag exists, automatic dates use supported installation/delivery evidence for today through 21 days ahead. A Y flag can retain work with a TBC or overdue date. AI dates are suggestions; open Edit product for evidence and flag provenance. Calendar bookings are not installation evidence. Y = Yes, N = No, ? = Unknown, N/A = Not applicable. Scroll sideways to see every column.</p>
      <nav aria-label="Product focus" className={styles.tabs}>{Object.entries(focusChoices).map(([key, label]) => <Link key={key} href={href({ focus: key, itemsPage: '1' })} aria-current={focus === key ? 'page' : undefined}>{label}</Link>)}</nav>
      {focused.length === 0 ? <FeedbackState tone="empty">{focus === 'upcoming' && count('unknown') > 0 ? <><p>{count('unknown')} {count('unknown') === 1 ? 'product has' : 'products have'} no target date or confirmed inclusion. Refresh from ServiceM8 to assess date evidence, or enter a target date or select Include manually.</p><Link href={href({ focus: 'unknown', itemsPage: '1' })}>Review products with unknown dates</Link></> : 'No products match this view. Check All products, Unknown or Review conflicts.'}</FeedbackState> : <div className={styles.planningShell}><TableShell label="Table B - Product planning"><table className={`${styles.table} ${styles.planningTable}`}>
        <thead><tr>{['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?'].map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{focused.slice((ip - 1) * itemsSize, ip * itemsSize).map(row => <Fragment key={row.itemId}>
          <tr>
            <td><strong>{row.jobNumber} / {row.customer}</strong><div>{row.address ?? 'Address unknown'}</div><div className={styles.source}>Target: {date(row.planningDate)}{row.dateSource === 'detected' ? ` · AI-suggested ${row.assessment?.result?.kind ?? 'date'}` : row.dateSource === 'staff' ? ' · Staff target' : ''}</div>{row.kanbanFlag && <div className={styles.source}>Master flag: {row.kanbanFlag.flag}{row.manual.focus !== 'auto' ? ' · Product override applies' : ' · Inherited'}</div>}<StatusBadge tone={row.focus === 'conflict' || row.focus === 'overdue' ? 'warning' : 'muted'}>{FOCUS_LABELS[row.focus]}</StatusBadge>{(!row.assessmentCurrent || row.assessment?.state === 'failed') && <div className={styles.source}>{row.assessment?.state === 'failed' ? 'Assessment failed; retry refresh' : 'Evidence assessment pending'}</div>}</td>
            <td><MaterialDescription label={row.label} description={row.description} jobNumber={row.jobNumber} editHref={href({ product: row.itemId! }) + `#product-${row.itemId}`} /><div className={styles.source}>Quantity: {row.quantity}</div>{row.manual.materialsEta && <div className={styles.source}>Materials ETA: {date(row.manual.materialsEta)}</div>}</td>
            <td>{row.manual.clientWaitingFor || '?'}</td>
            <td><ReadinessValue state={row.manual.siteReady} /></td>
            <td><ReadinessValue state={row.manual.glassReady} /></td>
            <td><ReadinessValue state={row.manual.hardwareReady} /></td>
            <td><ReadinessValue state={row.manual.designConfirmed} /></td>
            <td><div>PS1 needed: <ReadinessValue state={row.manual.ps1Required} /></div><div>PS1 issued: <ReadinessValue state={row.manual.ps1Issued} /></div><div>PS3 needed: <ReadinessValue state={row.manual.ps3Required} /></div><div>PS3 issued: <ReadinessValue state={row.manual.ps3Issued} /></div></td>
            <td><ReadinessValue state={row.manual.bottleStrut} /></td><td><ReadinessValue state={row.manual.buildingConsent} /></td><td><ReadinessValue state={row.manual.minorVariationRequired} /></td>
          </tr>
          <tr className={styles.editorRow}><td colSpan={11}>
            <details id={`product-${row.itemId}`} className={styles.product} open={value(p, 'product') === row.itemId}>
              <summary>Edit product · {shortMaterialDescription(row.label)}</summary><ProductEditor product={row} installers={data.installers} />
            </details>
          </td></tr>
        </Fragment>)}</tbody>
      </table></TableShell></div>}
      {pagination('items', focused.length, ip, productPages, itemsSize)}
    </DataPanel>
  </div>
}
