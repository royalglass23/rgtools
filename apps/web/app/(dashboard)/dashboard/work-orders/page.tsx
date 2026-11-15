import Link from 'next/link'
import { requireDashboardUser } from '@/lib/dashboard-access'
import { PageHeader, DataPanel, TableShell, FeedbackState, StatusBadge } from '@/components/precision-ui/PrecisionUI'
import { readWorkOrderDashboard, type DashboardProduct } from '@/modules/kanban/persistence'
import { FOCUS_LABELS, type Focus } from '@/modules/kanban/work-orders'
import { ProductEditor } from '@/modules/kanban/ProductEditor'
import { RefreshControl } from '@/modules/kanban/RefreshControl'
import { getWorkOrderRefreshStatus } from '@/modules/work-orders/queries'
import styles from '@/modules/kanban/WorkOrderDashboard.module.css'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
type Params = Record<string, string | string[] | undefined>
const value = (p: Params, key: string) => typeof p[key] === 'string' ? p[key] as string : ''
const pageNumber = (p: Params, key: string) => Math.max(1, Math.min(10000, Number.parseInt(value(p, key), 10) || 1))
const focusChoices = { all: 'All products', upcoming: 'Next 3 weeks', overdue: 'Overdue', unknown: 'Unknown', conflict: 'Review conflicts' }
function date(value: string | null) { return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : 'TBC' }

export default async function WorkOrderDashboard({ searchParams }: { searchParams: Promise<Params> }) {
  await requireDashboardUser()
  const p = await searchParams
  const q = value(p, 'q').trim().slice(0, 100)
  const focus = value(p, 'focus') in focusChoices ? value(p, 'focus') as keyof typeof focusChoices : 'upcoming'
  let data, status
  try { [data, status] = await Promise.all([readWorkOrderDashboard(q), getWorkOrderRefreshStatus()]) }
  catch { return <><PageHeader title="Work Orders dashboard" /><FeedbackState tone="error">Work Order records could not load. Reload the page or ask an administrator to check the dashboard migration.</FeedbackState></> }
  const products = data.rows.filter(row => row.itemId)
  const jobs = Array.from(new Map(data.rows.map(row => [row.jobId, row])).values())
  const focused = products.filter(row => focus === 'all' || (focus === 'upcoming' ? ['upcoming', 'included'].includes(row.focus) : row.focus === focus))
  const jobPages = Math.max(1, Math.ceil(jobs.length / 20)); const jp = Math.min(pageNumber(p, 'jobsPage'), jobPages)
  const productPages = Math.max(1, Math.ceil(focused.length / 20))
  const targetIndex = focused.findIndex(row => row.itemId === value(p, 'product'))
  const ip = targetIndex >= 0 ? Math.floor(targetIndex / 20) + 1 : Math.min(pageNumber(p, 'itemsPage'), productPages)
  function href(update: Record<string, string>) {
    const params = new URLSearchParams({ q, focus, jobsPage: String(jp), itemsPage: String(ip), ...update })
    return `/dashboard/work-orders?${params}`
  }
  function productLink(row: DashboardProduct) {
    return `/dashboard/work-orders?${new URLSearchParams({ q: row.jobNumber ?? '', focus: 'all', product: row.itemId ?? '' })}#product-${row.itemId}`
  }
  const count = (key: Focus) => products.filter(row => row.focus === key).length
  return <div className={styles.page}>
    <PageHeader title="Work Orders dashboard" description="Plan each product, record readiness and see what needs attention." actions={<RefreshControl lastSuccessfulAt={status.lastSuccessfulAt?.toISOString() ?? null} />} />
    <p className={styles.source}>ServiceM8 source refreshed: {status.lastSuccessfulAt ? status.lastSuccessfulAt.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' }) : 'Not yet refreshed'}. Staff edits save immediately in RG Tools. Dates use Auckland time.</p>
    {status.latestFailure && <FeedbackState tone="error">The latest ServiceM8 refresh failed. Previous saved records are shown.</FeedbackState>}
    <form method="get" className={styles.toolbar} action="/dashboard/work-orders">
      <label>Find a job or product<input name="q" type="search" defaultValue={q} placeholder="Job, customer, site or product" maxLength={100} /></label>
      <input type="hidden" name="focus" value={focus} /><button type="submit">Search</button>
      {q && <Link href="/dashboard/work-orders">Clear search</Link>}
    </form>
    <p className={styles.counts}><strong>{jobs.length}</strong> matching jobs · <strong>{products.length}</strong> products · {count('overdue')} overdue · {count('unknown')} unknown · {count('conflict')} conflicts</p>
    <DataPanel title="All work orders">
      {jobs.length === 0 ? <FeedbackState tone="empty">No saved Work Orders match this search. Clear the search or refresh from ServiceM8.</FeedbackState> : <TableShell label="All Work Orders"><table className={styles.table}>
        <thead><tr><th>Job</th><th>Customer / site</th><th>Products</th><th>Target install</th></tr></thead>
        <tbody>{jobs.slice((jp - 1) * 20, jp * 20).map(job => <tr key={job.jobId}>
          <td>{job.jobUuid ? <a href={`https://go.servicem8.com/OpenJob/${encodeURIComponent(job.jobUuid)}`} target="_blank" rel="noreferrer">{job.jobNumber ?? 'Unnumbered job'}</a> : job.jobNumber}</td>
          <td><strong>{job.customer}</strong><div>{job.address ?? 'Address unknown'}</div></td>
          <td><ul className={styles.productLinks}>{products.filter(row => row.jobId === job.jobId).map(row => <li key={row.itemId}><Link href={productLink(row)}>{row.label}</Link></li>)}</ul>{!products.some(row => row.jobId === job.jobId) && 'No active products recorded'}</td>
          <td>{date(job.jobInstallDate)}<div className={styles.source}>Job target; products may differ</div></td>
        </tr>)}</tbody>
      </table></TableShell>}
      <nav className={styles.paging} aria-label="Work Order pages"><Link aria-disabled={jp === 1} href={href({ jobsPage: String(Math.max(1, jp - 1)) })}>Previous</Link><span>Page {jp} of {jobPages}</span><Link aria-disabled={jp === jobPages} href={href({ jobsPage: String(Math.min(jobPages, jp + 1)) })}>Next</Link></nav>
    </DataPanel>
    <DataPanel title="Product planning">
      <p className={styles.source}>Next 3 weeks includes today through 21 days ahead. Overdue, unknown dates and conflicting manual selections have separate views. Bookings are not install confirmations.</p>
      <nav aria-label="Product focus" className={styles.tabs}>{Object.entries(focusChoices).map(([key, label]) => <Link key={key} href={href({ focus: key, itemsPage: '1' })} aria-current={focus === key ? 'page' : undefined}>{label}</Link>)}</nav>
      {focused.length === 0 && <FeedbackState tone="empty">No products match this view. Check All products, Unknown or Review conflicts.</FeedbackState>}
      {focused.slice((ip - 1) * 20, ip * 20).map(row => <details id={`product-${row.itemId}`} key={row.itemId} className={styles.product} open={value(p, 'product') === row.itemId}>
        <summary><span><strong>{row.jobNumber} · {row.customer}</strong><span className={styles.productLabel}>{row.label}</span><span>{row.address ?? 'Address unknown'}</span></span><span className={styles.productStatus}><span>Target: {date(row.installDate)}</span><StatusBadge tone={row.focus === 'conflict' || row.focus === 'overdue' ? 'warning' : 'muted'}>{FOCUS_LABELS[row.focus]}</StatusBadge></span></summary>
        <ProductEditor product={row} installers={data.installers} />
      </details>)}
      <nav className={styles.paging} aria-label="Product pages"><Link aria-disabled={ip === 1} href={href({ itemsPage: String(Math.max(1, ip - 1)) })}>Previous</Link><span>{focused.length} products · Page {ip} of {productPages}</span><Link aria-disabled={ip === productPages} href={href({ itemsPage: String(Math.min(productPages, ip + 1)) })}>Next</Link></nav>
    </DataPanel>
  </div>
}
