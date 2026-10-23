import Link from 'next/link'
import { PageHeader, FeedbackState } from '@/components/precision-ui/PrecisionUI'
import { PaginationBar } from '@/components/pagination/PaginationBar'
import { requireModule } from '@/lib/guard'
import { getTrackedQuoteOverview } from '@/modules/quote-tracker/overview-queries'
import { OVERVIEW_PAGE_SIZES, parseOverviewPaging, type EngagementPreview, type OverviewPaging, type OverviewPageSize } from '@/modules/quote-tracker/overview'
import { formatCurrency, formatDuration } from '@/modules/quote-tracker/presentation'
import { parseTrackedIn, TRACKED_PERIODS, trackedPeriodLabel, trackedQuoteListHref, type TrackedPeriod } from '@/modules/quote-tracker/quote-period'
import styles from './overview.module.css'
import { compactQuoteValue, QUOTE_PROGRESS_GROUPS, quoteProgressHref } from '@/modules/quote-tracker/quote-progress'

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

function overviewHref(paging: OverviewPaging, kind: ListKind, page: number, period: TrackedPeriod) {
  const params = new URLSearchParams({
    activityPage: String(kind === 'activity' ? page : paging.activity.page),
    activitySize: String(paging.activity.size),
    attentionPage: String(kind === 'attention' ? page : paging.attention.page),
    attentionSize: String(paging.attention.size),
    trackedIn: period,
  })
  return `/quote-tracker/overview?${params}`
}

function ListPagination({ kind, label, page, paging, period }: { kind: ListKind; label: string; page: ListPage; paging: OverviewPaging; period: TrackedPeriod }) {
  const otherKind = kind === 'activity' ? 'attention' : 'activity'
  return (
    <PaginationBar
      count={`${page.total} ${kind === 'activity' ? 'events' : 'quotes'}`}
      page={page.page}
      pageCount={page.pageCount}
      label={`${label} pages`}
      className={styles.pagination}
      previous={page.page > 1 ? <Link href={overviewHref(paging, kind, page.page - 1, period)}>Previous</Link> : <span aria-disabled="true">Previous</span>}
      next={page.page < page.pageCount ? <Link href={overviewHref(paging, kind, page.page + 1, period)}>Next</Link> : <span aria-disabled="true">Next</span>}
      pageSize={<form action="/quote-tracker/overview" method="get">
        <input type="hidden" name="trackedIn" value={period} />
        <input type="hidden" name={`${kind}Page`} value="1" />
        <input type="hidden" name={`${otherKind}Page`} value={paging[otherKind].page} />
        <input type="hidden" name={`${otherKind}Size`} value={paging[otherKind].size} />
        <label htmlFor={`${kind}-page-size`}>Page size</label>
        <select id={`${kind}-page-size`} name={`${kind}Size`} defaultValue={page.size}>
          {OVERVIEW_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <button type="submit">Apply</button>
      </form>}
    />
  )
}

function EngagementPreviewPanel({ preview }: { preview: EngagementPreview }) {
  return (
    <div className={styles.engagementPreview}>
      <h3>Engagement</h3>
      <dl className={styles.engagementMetrics}>
        <div><dt>Total opens</dt><dd>{preview.totalOpens}</dd></div>
        <div><dt>Unique viewers</dt><dd>{preview.uniqueSessions}</dd></div>
        <div><dt>Total time</dt><dd>{formatDuration(preview.totalTimeMs)}</dd></div>
        <div><dt>Max scroll</dt><dd>{preview.maxScrollDepth}%</dd></div>
        <div><dt>Forwarding</dt><dd>{preview.forwardingSuspected ? <span className={styles.forwardingFlag}>Suspected</span> : 'No signal'}</dd></div>
      </dl>
      <div className={styles.scoreLabel}><span>Interest score</span><span>{preview.interestScore}/100</span></div>
      <div className={styles.scoreTrack} role="progressbar" aria-label="Interest score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={preview.interestScore}>
        <div className={styles.scoreFill} style={{ width: `${preview.interestScore}%` }} />
      </div>
    </div>
  )
}

export default async function TrackedQuoteOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModule('quote-tracker')
  const params = await searchParams
  const period = parseTrackedIn(params.trackedIn)
  const paging = parseOverviewPaging(params)
  const overview = await getTrackedQuoteOverview(paging, period)
  const currentPaging: OverviewPaging = {
    activity: { page: overview.activity.page, size: overview.activity.size },
    attention: { page: overview.attention.page, size: overview.attention.size },
  }
  const cards = [
    { label: 'Total value', value: compactQuoteValue(overview.snapshot.totalValue), detail: `Exact value: ${formatCurrency(overview.snapshot.totalValue)}`, filter: {} },
    { label: 'Active links', value: overview.snapshot.activeLinks, filter: {} },
    { label: 'Hot quotes', value: overview.snapshot.hotCount, filter: { status: 'hot' } },
    { label: 'Warm quotes', value: overview.snapshot.warmCount, filter: { status: 'warm' } },
    { label: 'Cold quotes', value: overview.snapshot.coldCount, filter: { status: 'cold' } },
    { label: 'Unopened', value: overview.snapshot.unopenedAfterThreeDays, detail: 'Unopened for at least 3 days. Excludes won and lost quotes.', filter: { activity: 'unopened_3_days' } },
    { label: 'Forwarded', value: overview.snapshot.forwardingCount, detail: 'Suspected forwarding based on tracking signals; not confirmed forwarding.', filter: { activity: 'forwarding' } },
    { label: 'Quotes viewed', value: overview.snapshot.viewedCount, filter: { activity: 'viewed' } },
  ]
  const progressTotal = overview.progress.reduce((sum, group) => sum + group.count, 0)
  const maxProgress = Math.max(1, ...overview.progress.map((group) => group.count))

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Quotes"
        title="Tracked quote activity"
        description="See which tracked quotes need attention and what has happened on their links."
        actions={<Link className={styles.headerLink} href={trackedQuoteListHref(period)}>Track Quotes</Link>}
      />
      <p className={styles.asOf}>As of <time dateTime={overview.asOf.toISOString()}>{nzDateTime.format(overview.asOf)}</time></p>

      <nav aria-label="Quotes tracked in" className={styles.periodFilter}>
        <span>Quotes tracked in</span>
        {TRACKED_PERIODS.map((choice) => (
          <Link key={choice} aria-current={choice === period ? 'page' : undefined}
            href={`/quote-tracker/overview?${new URLSearchParams({ trackedIn: choice, activitySize: String(paging.activity.size), attentionSize: String(paging.attention.size) })}`}>
            {trackedPeriodLabel(choice)}
          </Link>
        ))}
      </nav>
      <p className={styles.asOf}>Cards and attention lists include active links, excluding won and lost quotes. Every section uses the selected period.</p>

      <section aria-label="Tracked link snapshot" className={styles.snapshot}>
        {cards.map((card, index) => <Link key={card.label} href={trackedQuoteListHref(period, card.filter)} className={`${styles.cardLink} ${index < 2 ? styles.primaryCard : styles.smallCard}`} aria-label={`${card.label}: ${card.value}. View quotes`} aria-describedby={card.detail ? `card-hint-${index}` : undefined}>
          <span className={styles.cardLabel}>{card.label}</span><strong className={styles.cardValue}>{card.value}</strong>
          {card.detail && <span role="tooltip" id={`card-hint-${index}`} className={styles.tooltip}>{card.detail}</span>}
        </Link>)}
      </section>

      <section className={styles.progressPanel} aria-labelledby="quote-progress-heading">
        <div className={styles.progressHeading}>
          <h2 id="quote-progress-heading">Quote progress</h2><span>{progressTotal} quotes</span>
        </div>
        <p className={styles.panelNote}>Active links and confirmed outcomes · Select a status to view entries</p>
        <ul className={styles.progressList}>
          {QUOTE_PROGRESS_GROUPS.map((group) => {
            const bucket = overview.progress.find((entry) => entry.id === group.id)!
            return <li key={group.id}>
              <Link className={styles.progressRow} href={quoteProgressHref(period, group.id)} aria-label={`${group.label}: ${bucket.count} quotes. View quotes`} aria-describedby={`progress-hint-${group.id}`}>
                <span className={styles.progressLabel}>{group.label}</span>
                <span className={styles.progressTrack} aria-hidden="true"><span className={`${styles.progressFill} ${group.id === 'overdue' ? styles.overdueFill : ''}`} style={{ width: `${bucket.count / maxProgress * 100}%` }} /></span>
                <strong className={styles.progressCount}>{bucket.count}</strong>
                <span role="tooltip" className={styles.tooltip} id={`progress-hint-${group.id}`}>{formatCurrency(bucket.totalValue)} · {group.detail}{group.id === 'won' || group.id === 'lost' ? '' : ' · Recorded opens do not confirm a sale'}</span>
              </Link>
            </li>
          })}
        </ul>
        {progressTotal === 0 && <p className={styles.panelNote}>No tracked quotes match this period and scope.</p>}
      </section>

      <div className={styles.mainGrid}>
        <details className={styles.accordion} open>
          <summary className={styles.accordionSummary}>
            <div className={styles.accordionHeading}>
              <span className={styles.accordionEyebrow}>Active tracked links</span>
              <div className={styles.accordionTitle}><h2>Needs attention</h2><span className={styles.accordionCount}>{overview.attention.total} quotes</span></div>
            </div>
            <span className={styles.accordionToggle} aria-hidden="true"><span className={styles.showLabel}>Show</span><span className={styles.hideLabel}>Hide</span><span className={styles.chevron} /></span>
          </summary>
          <div className={styles.accordionBody}>
          {overview.attention.rows.length === 0 ? (
            <FeedbackState tone="empty">No active tracked quotes currently match the follow-up signals in this period.</FeedbackState>
          ) : (
            <ul className={styles.attentionList}>
              {overview.attention.rows.map((quote) => (
                <li key={quote.id}>
                  <Link href={`/quote-tracker/${quote.id}`} className={styles.rowLink}>
                    <span className={styles.rowMain}>
                      <strong>{quote.workOrderId ? `${quote.workOrderId} · ` : ''}{quote.clientName}</strong>
                      <span className={styles.jobAddress}>{quote.jobAddress ?? 'Address not recorded'}</span>
                      <span>{quote.reasons.join(' · ')}</span>
                    </span>
                    <span className={styles.rowTime}>{quote.lastOpenedAt ? `Last opened ${nzDateTime.format(quote.lastOpenedAt)}` : 'Not opened'}</span>
                  </Link>
                  <EngagementPreviewPanel preview={quote.engagementPreview} />
                </li>
              ))}
            </ul>
          )}
          <p className={styles.panelNote}>Hot status may have been set manually. Check the quote detail before following up.</p>
          <ListPagination kind="attention" label="Needs attention" page={overview.attention} paging={currentPaging} period={period} />
          </div>
        </details>

        <details className={styles.accordion} open>
          <summary className={styles.accordionSummary}>
            <div className={styles.accordionHeading}>
              <span className={styles.accordionEyebrow}>Observed on tracked links</span>
              <div className={styles.accordionTitle}><h2>Recent activity</h2><span className={styles.accordionCount}>{overview.activity.total} events</span></div>
            </div>
            <span className={styles.accordionToggle} aria-hidden="true"><span className={styles.showLabel}>Show</span><span className={styles.hideLabel}>Hide</span><span className={styles.chevron} /></span>
          </summary>
          <div className={styles.accordionBody}>
          {overview.activity.rows.length === 0 ? (
            <FeedbackState tone="empty">No quote opens, downloads, or action clicks match this period and active quote filters.</FeedbackState>
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
                  <EngagementPreviewPanel preview={event.engagementPreview} />
                </li>
              ))}
            </ul>
          )}
          <p className={styles.panelNote}>Each line is an event, not a unique viewer or a confirmed sale.</p>
          <ListPagination kind="activity" label="Recent activity" page={overview.activity} paging={currentPaging} period={period} />
          </div>
        </details>
      </div>
    </div>
  )
}
