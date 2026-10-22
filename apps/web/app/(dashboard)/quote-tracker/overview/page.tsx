import Link from 'next/link'
import { PageHeader, DataPanel, FeedbackState, KpiCard } from '@/components/precision-ui/PrecisionUI'
import { requireModule } from '@/lib/guard'
import { getTrackedQuoteOverview } from '@/modules/quote-tracker/overview-queries'
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

export default async function TrackedQuoteOverviewPage() {
  await requireModule('quote-tracker')
  const overview = await getTrackedQuoteOverview()

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Quotes"
        title="Tracked quote activity"
        description="See recent activity on tracked links and the quotes that may need attention."
        actions={<Link className={styles.headerLink} href="/quote-tracker">Track Quotes</Link>}
      />
      <p className={styles.asOf}>As of <time dateTime={overview.asOf.toISOString()}>{nzDateTime.format(overview.asOf)}</time></p>

      <div className={styles.mainGrid}>
        <DataPanel title="Recent activity" eyebrow="Observed on tracked links">
          {overview.activity.length === 0 ? (
            <FeedbackState tone="empty">No quote opens, downloads, or action clicks have been recorded yet.</FeedbackState>
          ) : (
            <ul className={styles.activityList}>
              {overview.activity.map((event) => (
                <li key={event.id}>
                  <Link href={`/quote-tracker/${event.quoteId}`} className={styles.rowLink}>
                    <span className={styles.rowMain}>
                      <strong>{event.workOrderId ? `${event.workOrderId} · ` : ''}{event.clientName}</strong>
                      <span>{eventLabel(event.eventType)}</span>
                    </span>
                    <time dateTime={event.createdAt.toISOString()}>{nzDateTime.format(event.createdAt)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.panelNote}>Each line is an event, not a unique viewer or a confirmed sale.</p>
        </DataPanel>

        <DataPanel title="Needs attention" eyebrow="Active tracked links">
          {overview.attention.length === 0 ? (
            <FeedbackState tone="empty">No active tracked quotes currently match the follow-up signals.</FeedbackState>
          ) : (
            <ul className={styles.attentionList}>
              {overview.attention.map((quote) => (
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
        </DataPanel>
      </div>

      <section aria-label="Tracked link snapshot" className={styles.snapshot}>
        <KpiCard label="Active tracked links" value={overview.snapshot.activeLinks} detail="Links currently available" />
        <KpiCard label="Viewed in the last 7 days" value={overview.snapshot.viewedLastSevenDays} detail="Distinct active quotes with an open" />
        <KpiCard label="Never opened" value={overview.snapshot.neverOpened} detail="Active links with no recorded open" />
      </section>
    </div>
  )
}
