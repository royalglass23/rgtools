import Link from 'next/link'
import { PageHeader, DataPanel, FeedbackState, KpiCard } from '@/components/precision-ui/PrecisionUI'
import { requireModule } from '@/lib/guard'
import { getTrackedQuoteOverview } from '@/modules/quote-tracker/overview-queries'
import { OVERVIEW_PAGE_SIZES, parseOverviewPaging, type OverviewPaging, type OverviewPageSize } from '@/modules/quote-tracker/overview'
import styles from './overview.module.css'

const nzDateTime = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

function eventLabel(type: string) {
  if (type === 'open') return 'Opened the quote'
  if (type === 'download') return 'Downloaded the PDF'
  return 'Clicked an action'
}

type ListPage = { total: number; page: number; size: OverviewPageSize; pageCount: number }
type ListKind = keyof OverviewPaging

function overviewHref(paging: OverviewPaging, kind: ListKind, page: number) {
  const params = new URLSearchParams({
    activityPage: String(kind === 'activity' ? page : paging.activity.page),
    activitySize: String(paging.activity.size),
    attentionPage: String(kind === 'attention' ? page : paging.attention.page),
    attentionSize: String(paging.attention.size),
  })
  return `/quote-tracker/overview?${params}`
}

function ListPagination({ kind, label, page, paging }: { kind: ListKind; label: string; page: ListPage; paging: OverviewPaging }) {
  const otherKind = kind === 'activity' ? 'attention' : 'activity'
  return (
    <div className={styles.pagination}>
      <span className={styles.pageTotal}>{page.total} {kind === 'activity' ? 'events' : 'quotes'}</span>
      <nav aria-label={`${label} pages`} className={styles.pageLinks}>
        {page.page > 1 ? <Link href={overviewHref(paging, kind, page.page - 1)}>Previous</Link> : <span aria-disabled="true">Previous</span>}
        <span>Page {page.page} of {page.pageCount}</span>
        {page.page < page.pageCount ? <Link href={overviewHref(paging, kind, page.page + 1)}>Next</Link> : <span aria-disabled="true">Next</span>}
      </nav>
      <form action="/quote-tracker/overview" method="get" className={styles.pageSizeForm}>
        <input type="hidden" name={`${kind}Page`} value="1" />
        <input type="hidden" name={`${otherKind}Page`} value={paging[otherKind].page} />
        <input type="hidden" name={`${otherKind}Size`} value={paging[otherKind].size} />
        <label htmlFor={`${kind}-page-size`}>{label} rows per page</label>
        <select id={`${kind}-page-size`} name={`${kind}Size`} defaultValue={page.size}>
          {OVERVIEW_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <button type="submit">Apply</button>
      </form>
    </div>
  )
}

export default async function TrackedQuoteOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModule('quote-tracker')
  const paging = parseOverviewPaging(await searchParams)
  const overview = await getTrackedQuoteOverview(paging)
  const currentPaging: OverviewPaging = {
    activity: { page: overview.activity.page, size: overview.activity.size },
    attention: { page: overview.attention.page, size: overview.attention.size },
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Quotes"
        title="Tracked quote activity"
        description="See recent activity on tracked links and the quotes that may need attention."
        actions={<Link className={styles.headerLink} href="/quote-tracker">Track Quotes</Link>}
      />
      <p className={styles.asOf}>As of <time dateTime={overview.asOf.toISOString()}>{nzDateTime.format(overview.asOf)}</time></p>

      <section aria-label="Tracked link snapshot" className={styles.snapshot}>
        <KpiCard label="Active tracked links" value={overview.snapshot.activeLinks} detail="Links currently available" />
        <KpiCard label="Viewed in the last 7 days" value={overview.snapshot.viewedLastSevenDays} detail="Distinct active quotes with an open" />
        <KpiCard label="Viewed in the last 30 days" value={overview.snapshot.viewedLastThirtyDays} detail="Distinct active quotes with an open" />
        <KpiCard label="Never opened" value={overview.snapshot.neverOpened} detail="Active links with no recorded open" />
      </section>

      <div className={styles.mainGrid}>
        <DataPanel title="Recent activity" eyebrow="Observed on tracked links">
          {overview.activity.rows.length === 0 ? (
            <FeedbackState tone="empty">No quote opens, downloads, or action clicks have been recorded yet.</FeedbackState>
          ) : (
            <ul className={styles.activityList}>
              {overview.activity.rows.map((event) => (
                <li key={event.id}>
                  <Link href={`/quote-tracker/${event.quoteId}`} className={styles.rowLink}>
                    <span className={styles.rowMain}>
                      <strong>{event.workOrderId ?? 'No job number'} · {event.clientName}</strong>
                      <span className={styles.jobAddress}>{event.jobAddress ?? 'Address not recorded'}</span>
                      <span>{eventLabel(event.eventType)}</span>
                    </span>
                    <time dateTime={event.createdAt.toISOString()}>{nzDateTime.format(event.createdAt)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.panelNote}>Each line is an event, not a unique viewer or a confirmed sale.</p>
          <ListPagination kind="activity" label="Recent activity" page={overview.activity} paging={currentPaging} />
        </DataPanel>

        <DataPanel title="Needs attention" eyebrow="Active tracked links">
          {overview.attention.rows.length === 0 ? (
            <FeedbackState tone="empty">No active tracked quotes currently match the follow-up signals.</FeedbackState>
          ) : (
            <ul className={styles.attentionList}>
              {overview.attention.rows.map((quote) => (
                <li key={quote.id}>
                  <Link href={`/quote-tracker/${quote.id}`} className={styles.rowLink}>
                    <span className={styles.rowMain}>
                      <strong>{quote.workOrderId ? `${quote.workOrderId} · ` : ''}{quote.clientName}</strong>
                      <span>{quote.reasons.join(' · ')}</span>
                    </span>
                    <span className={styles.rowTime}>{quote.lastOpenedAt ? `Last opened ${nzDateTime.format(quote.lastOpenedAt)}` : 'Not opened'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.panelNote}>Hot status may have been set manually. Check the quote detail before following up.</p>
          <ListPagination kind="attention" label="Needs attention" page={overview.attention} paging={currentPaging} />
        </DataPanel>
      </div>
    </div>
  )
}
