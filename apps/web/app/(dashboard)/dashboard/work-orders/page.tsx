import Link from 'next/link'
import Form from 'next/form'
import { requireDashboardUser } from '@/lib/dashboard-access'
import { PageHeader, DataPanel, TableShell, FeedbackState } from '@/components/precision-ui/PrecisionUI'
import { PaginationBar } from '@/components/pagination/PaginationBar'
import { readWorkOrderDashboard } from '@/modules/kanban/persistence'
import { DASHBOARD_PAGE_SIZES, dashboardPageSize } from '@/modules/kanban/work-orders'
import { MaterialDescription } from '@/modules/kanban/MaterialDescription'
import styles from '@/modules/kanban/WorkOrderDashboard.module.css'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
type Params = Record<string, string | string[] | undefined>
const value = (p: Params, key: string) => typeof p[key] === 'string' ? p[key] as string : ''
const pageNumber = (p: Params, key: string) => Math.max(1, Math.min(10000, Number.parseInt(value(p, key), 10) || 1))

export default async function WorkOrderDashboard({ searchParams }: { searchParams: Promise<Params> }) {
  await requireDashboardUser()
  const p = await searchParams
  const q = value(p, 'q').trim().slice(0, 100)
  let data
  try { data = await readWorkOrderDashboard(q) }
  catch { return <><PageHeader title="Work Orders dashboard" /><FeedbackState tone="error">Work Order records could not load. Reload the page or ask an administrator to check the dashboard.</FeedbackState></> }
  const jobs = Array.from(new Map(data.rows.map(row => [row.jobId, row])).values())
  const products = data.rows.filter(row => row.itemId && row.inDueWindow)
  const jobsSize = dashboardPageSize(value(p, 'jobsSize')); const itemsSize = dashboardPageSize(value(p, 'itemsSize'))
  const jobPages = Math.max(1, Math.ceil(jobs.length / jobsSize)); const jp = Math.min(pageNumber(p, 'jobsPage'), jobPages)
  const productPages = Math.max(1, Math.ceil(products.length / itemsSize)); const ip = Math.min(pageNumber(p, 'itemsPage'), productPages)
  const current = { q, jobsPage: String(jp), jobsSize: String(jobsSize), itemsPage: String(ip), itemsSize: String(itemsSize) }
  function href(update: Record<string, string>) { return `/dashboard/work-orders?${new URLSearchParams({ ...current, ...update })}` }
  function pagination(kind: 'jobs' | 'items', total: number, page: number, pageCount: number, size: number) {
    const key = `${kind}Page`; const sizeKey = `${kind}Size`
    return <PaginationBar count={`${total} ${kind === 'jobs' ? 'work orders' : 'products'}`} page={page} pageCount={pageCount}
      label={kind === 'jobs' ? 'Work Order pages' : 'Product pages'}
      previous={page > 1 ? <Link href={href({ [key]: String(page - 1) })}>Previous</Link> : <span aria-disabled="true">Previous</span>}
      next={page < pageCount ? <Link href={href({ [key]: String(page + 1) })}>Next</Link> : <span aria-disabled="true">Next</span>}
      pageSize={<Form action="/dashboard/work-orders" prefetch={false}>
        {Object.entries(current).filter(([name]) => name !== sizeKey).map(([name, val]) => <input key={name} type="hidden" name={name} value={name === key ? '1' : val} />)}
        <label htmlFor={`${kind}-page-size`}>Page size</label>
        <select key={size} id={`${kind}-page-size`} name={sizeKey} defaultValue={String(size)}>{DASHBOARD_PAGE_SIZES.map(option => <option key={option} value={option}>{option}</option>)}</select>
        <button type="submit">Apply</button>
      </Form>} />
  }
  return <div className={styles.page}>
    <PageHeader title="Work Orders dashboard" />
    <Form className={styles.toolbar} action="/dashboard/work-orders" prefetch={false}>
      <label>Find a job or product<input key={q} name="q" type="search" defaultValue={q} placeholder="Job, customer, site or product" maxLength={100} /></label>
      <input type="hidden" name="jobsSize" value={jobsSize} /><input type="hidden" name="itemsSize" value={itemsSize} /><button type="submit">Search</button>
      {q && <Link href="/dashboard/work-orders">Clear search</Link>}
    </Form>
    <DataPanel title="Table A - Every work order">
      <TableShell label="All Work Order rows"><table className={styles.table}>
        <thead><tr>{['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?'].map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{jobs.slice((jp - 1) * jobsSize, jp * jobsSize).map(job => <tr key={job.jobId}>
          <td>{job.jobUuid ? <a href={`https://go.servicem8.com/OpenJob/${encodeURIComponent(job.jobUuid)}`} target="_blank" rel="noreferrer">{job.jobNumber ?? 'Unnumbered job'}</a> : job.jobNumber}</td>
          <td>{job.customer}</td><td>{job.address ?? 'Address unknown'}</td><td /><td />
        </tr>)}</tbody>
      </table></TableShell>
      {jobs.length === 0 && <FeedbackState tone="empty">No saved Work Orders match this search.</FeedbackState>}
      {pagination('jobs', jobs.length, jp, jobPages, jobsSize)}
    </DataPanel>
    <DataPanel title="Table B - Due within 3 weeks">
      <TableShell label="Due product rows"><table className={`${styles.table} ${styles.planningTable}`}>
        <thead><tr>{['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?'].map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{products.slice((ip - 1) * itemsSize, ip * itemsSize).map(row => <tr key={row.itemId}>
          <td><strong>{row.jobNumber} / {row.customer}</strong><div>{row.address ?? 'Address unknown'}</div></td>
          <td><MaterialDescription label={row.label} description={row.description} jobNumber={row.jobNumber} /></td>
          {Array.from({ length: 9 }, (_, index) => <td key={index} />)}
        </tr>)}</tbody>
      </table></TableShell>
      {products.length === 0 && <FeedbackState tone="empty">No saved products are due within 3 weeks.</FeedbackState>}
      {pagination('items', products.length, ip, productPages, itemsSize)}
    </DataPanel>
  </div>
}
