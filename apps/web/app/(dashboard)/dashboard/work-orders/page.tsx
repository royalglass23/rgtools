import Link from 'next/link'
import Form from 'next/form'
import { requireDashboardUser } from '@/lib/dashboard-access'
import { PageHeader, DataPanel, TableShell, FeedbackState } from '@/components/precision-ui/PrecisionUI'
import { PaginationBar } from '@/components/pagination/PaginationBar'
import { filterPublishedOutput, type PublishedOutput } from '@/modules/kanban/published-output'
import { readLatestPublication, readPublicationChanges, readPublicationHistory } from '@/modules/kanban/publication-store'
import { UUID, type PublicationEvent, type StoredPublication } from '@/modules/kanban/publication'
import { PublishedRefreshControl } from '@/modules/kanban/PublishedRefreshControl'
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
  let data: PublishedOutput = { jobs: [], products: [] }, loadFailed = false, latest: StoredPublication | null = null
  try {
    latest = await readLatestPublication()
    if (latest) data = filterPublishedOutput({ jobs: latest.publication.tables.jobs.map(row => ({ key: row.id, cells: row.cells })), products: latest.publication.tables.products.map(row => ({ key: row.id, cells: row.cells })) }, q)
  }
  catch { loadFailed = true }
  const historyPage = Math.min(1000, pageNumber(p, 'historyPage')), publicationId = UUID.test(value(p, 'publication')) ? value(p, 'publication').toLowerCase() : ''
  let history: Awaited<ReturnType<typeof readPublicationHistory>> = { events: [], hasNext: false }, selected: PublicationEvent | null = null, historyFailed = false
  try {
    history = await readPublicationHistory(historyPage)
    if (UUID.test(publicationId)) selected = await readPublicationChanges(publicationId)
  } catch { historyFailed = true }
  const details = selected?.changes ? [
    ...selected.changes.added.map(row => ({ key: `add-${row.table}-${row.id}`, label: `Added row · Table ${row.table === 'jobs' ? 'A' : 'B'} · ${row.id}`, before: '', after: row.cells.join('\n') })),
    ...selected.changes.removed.map(row => ({ key: `remove-${row.table}-${row.id}`, label: `Removed row · Table ${row.table === 'jobs' ? 'A' : 'B'} · ${row.id}`, before: row.cells.join('\n'), after: '' })),
    ...selected.changes.changed.map(field => ({ key: `edit-${field.table}-${field.id}-${field.column}`, label: `Table ${field.table === 'jobs' ? 'A' : 'B'} · ${field.id} · ${field.label}`, before: field.before, after: field.after })),
  ] : []
  const changePage = Math.min(pageNumber(p, 'changePage'), Math.max(1, Math.ceil(details.length / 50)))
  const { jobs, products } = data
  const jobsSize = dashboardPageSize(value(p, 'jobsSize')); const itemsSize = dashboardPageSize(value(p, 'itemsSize'))
  const jobPages = Math.max(1, Math.ceil(jobs.length / jobsSize)); const jp = Math.min(pageNumber(p, 'jobsPage'), jobPages)
  const productPages = Math.max(1, Math.ceil(products.length / itemsSize)); const ip = Math.min(pageNumber(p, 'itemsPage'), productPages)
  const current = { q, jobsPage: String(jp), jobsSize: String(jobsSize), itemsPage: String(ip), itemsSize: String(itemsSize), historyPage: String(historyPage), ...(publicationId ? { publication: publicationId, changePage: String(changePage) } : {}) }
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
    <PublishedRefreshControl publicationId={latest?.publication.publicationId ?? null} />
    {latest && <p className={styles.source}>Source as of {latest.publication.sourceAsOf} · Received {latest.receivedAt} (UTC)</p>}
    {!latest && !loadFailed && <FeedbackState tone="empty">No Kanban publication received yet.</FeedbackState>}
    {loadFailed && <FeedbackState tone="error">Kanban output could not load. Ask an administrator to check publication storage.</FeedbackState>}
    <Form className={styles.toolbar} action="/dashboard/work-orders" prefetch={false}>
      <label>Find a job or product<input key={q} name="q" type="search" defaultValue={q} placeholder="Job, customer, site or product" maxLength={100} /></label>
      <input type="hidden" name="jobsSize" value={jobsSize} /><input type="hidden" name="itemsSize" value={itemsSize} /><button type="submit">Search</button>
      {q && <Link href="/dashboard/work-orders">Clear search</Link>}
    </Form>
    <DataPanel title="Table A - Every work order">
      <TableShell label="All Work Order rows"><table className={styles.table}>
        <thead><tr>{['WO', 'Customer', 'Short address', 'Approx install date', 'Within 3 weeks?'].map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{jobs.slice((jp - 1) * jobsSize, jp * jobsSize).map(job => <tr key={job.key}>
          {job.cells.map((cell, index) => <td key={index} style={{ whiteSpace: 'pre-line' }}>{cell}</td>)}
        </tr>)}</tbody>
      </table></TableShell>
      {jobs.length === 0 && <FeedbackState tone="empty">No rows to display.</FeedbackState>}
      {pagination('jobs', jobs.length, jp, jobPages, jobsSize)}
    </DataPanel>
    <DataPanel title="Table B - Due within 3 weeks">
      <TableShell label="Due product rows"><table className={`${styles.table} ${styles.planningTable}`}>
        <thead><tr>{['WO / client / address', 'Materials (per product)', 'Client waiting for', 'Site ready', 'Glass ready', 'Hardware ready', 'Design Y/N/?', 'PS1 / PS3', 'Bottle strut', 'BC?', 'Minor var?'].map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{products.slice((ip - 1) * itemsSize, ip * itemsSize).map(row => <tr key={row.key}>
          <td style={{ whiteSpace: 'pre-line' }}>{row.cells[0]}</td>
          <td><MaterialDescription label={row.cells[1]} description={row.cells[1]} jobNumber={row.cells[0].split('\n')[0]} /></td>
          {row.cells.slice(2).map((cell, index) => <td key={index} style={{ whiteSpace: 'pre-line' }}>{cell}</td>)}
        </tr>)}</tbody>
      </table></TableShell>
      {products.length === 0 && <FeedbackState tone="empty">No rows to display.</FeedbackState>}
      {pagination('items', products.length, ip, productPages, itemsSize)}
    </DataPanel>
    <DataPanel title="Publication history">
      {historyFailed && <FeedbackState tone="error">Publication history could not load.</FeedbackState>}
      {!historyFailed && history.events.length === 0 && <p>No publications received yet.</p>}
      <ol>{history.events.map(event => <li key={event.id}>
        <Link href={href({ publication: event.id, changePage: '1' })}>{event.receivedAt}</Link>{' · '}
        {event.outcome === 'published' ? event.initial ? `Initial snapshot: ${event.tableCounts.jobs} Table A rows, ${event.tableCounts.products} Table B rows` : `${event.counts.added} rows added, ${event.counts.removed} removed, ${event.counts.changed} fields changed` : event.outcome === 'no_change' ? 'No changes' : event.outcome === 'stale' ? 'Rejected older snapshot' : 'Rejected conflicting snapshot timing'}
        <span className={styles.source}> · Source {event.sourceAsOf} · Generated {event.generatedAt} (UTC)</span>
      </li>)}</ol>
      <nav aria-label="Publication history pages">{historyPage > 1 && <Link href={href({ historyPage: String(historyPage - 1) })}>Newer publications</Link>}{' '}{history.hasNext && historyPage < 1000 && <Link href={href({ historyPage: String(historyPage + 1) })}>Older publications</Link>}</nav>
      {selected && <section aria-label="Publication changes">
        <h3>Publication {selected.publicationId}</h3>
        {details.length === 0 ? <p>{selected.outcome === 'no_change' ? 'No row or field changes.' : 'This publication did not replace the stored snapshot.'}</p> : <>
          <ul>{details.slice((changePage - 1) * 50, changePage * 50).map(detail => <li key={detail.key}><strong>{detail.label}</strong><dl><dt>Before</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{detail.before || '(blank)'}</dd><dt>After</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{detail.after || '(blank)'}</dd></dl></li>)}</ul>
          <nav aria-label="Publication change pages">{changePage > 1 && <Link href={href({ changePage: String(changePage - 1) })}>Previous changes</Link>}{' '}{changePage * 50 < details.length && <Link href={href({ changePage: String(changePage + 1) })}>More changes</Link>}</nav>
        </>}
      </section>}
    </DataPanel>
  </div>
}
