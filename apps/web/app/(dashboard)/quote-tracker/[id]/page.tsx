import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { requireModule } from '@/lib/guard'
import { createAiSuggestionAction, createConversationSnapshotAction } from '@/modules/quote-tracker/actions'
import { AiGuidancePanel } from '@/modules/quote-tracker/AiGuidancePanel'
import { CopyLinkButton } from '@/modules/quote-tracker/CopyLinkButton'
import { EmailGateSettingsForm } from '@/modules/quote-tracker/EmailGateSettingsForm'
import { ExpireLinkButton } from '@/modules/quote-tracker/ExpireLinkButton'
import { isActiveLink, isExpired } from '@/modules/quote-tracker/expiry'
import { getQuoteDetail, setManualTag, updateQuoteEmailGate } from '@/modules/quote-tracker/queries'
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  StatusBadge,
} from '@/modules/quote-tracker/presentation'
import { ViewerAnalyticsTable } from '@/modules/quote-tracker/ViewerAnalyticsTable'
import { type EngagementData, type StatusTag } from '@/modules/quote-tracker/score'
import { DismissibleNotice } from '@/modules/ui/DismissibleNotice'

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireModule('quote-tracker')
  const { id } = await params
  const notices = await searchParams
  const detail = await getQuoteDetail(id)
  if (!detail) notFound()

  const expired = isExpired(detail.quote.expiresAt)
  const active = isActiveLink(detail.quote.expiresAt, detail.quote.archivedAt)
  const quoteUrl = !expired && detail.quote.shortCode
    ? `https://quotes.royalglass.co.nz/q/${detail.quote.shortCode}`
    : ''
  const engagementData = buildEngagementData(detail)
  const computedScore = detail.quote.aiScore
  const overrideTag = detail.overrides[0]?.newTag ?? null
  const effectiveTag = detail.quote.statusTag

  async function saveManualTag(formData: FormData) {
    'use server'

    await requireModule('quote-tracker')
    const session = await auth()
    const tag = formData.get('tag')
    if (!session?.user?.id || !isStatusTag(tag)) return

    await setManualTag(id, tag, session.user.id)
    revalidatePath(`/quote-tracker/${id}`)
    revalidatePath('/quote-tracker')
  }

  async function saveEmailGate(formData: FormData) {
    'use server'

    await requireModule('quote-tracker')
    const result = await updateQuoteEmailGate(id, {
      enabled: formData.get('emailGateEnabled') === 'on',
      recipientEmails: formData.get('recipientEmails')?.toString() ?? null,
    })

    if (!result.ok) {
      redirect(`/quote-tracker/${id}?gateError=${encodeURIComponent(result.message)}`)
    }

    revalidatePath(`/quote-tracker/${id}`)
    revalidatePath('/quote-tracker')
    redirect(`/quote-tracker/${id}?gateSaved=1`)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/quote-tracker" className="text-sm text-gray-500 hover:text-gray-900">Back to quote tracker</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-950">
              {detail.quote.workOrderId ? `${detail.quote.workOrderId} - ` : ''}{detail.quote.clientName}
            </h1>
            <StatusBadge tag={effectiveTag} />
          </div>
        </div>
      </div>

      <Section title="Quote">
        {typeof notices.gateError === 'string' && (
          <DismissibleNotice tone="error" noticeKey={notices.gateError}>
            {notices.gateError}
          </DismissibleNotice>
        )}
        {notices.gateSaved === '1' && (
          <DismissibleNotice tone="success" noticeKey="email-gate-saved">
            Email gate settings saved.
          </DismissibleNotice>
        )}
        <dl className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Job Address</dt>
            <dd className="mt-1 break-words text-sm text-gray-950">{detail.quote.jobAddress ?? '-'}</dd>
          </div>
          <div className="lg:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Job Description</dt>
            <dd className="mt-1 break-words text-sm text-gray-950">{detail.quote.jobDescription ?? '-'}</dd>
          </div>
          <Field label="Value" value={formatCurrency(detail.quote.quoteValue)} />
          <div className="lg:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Link</dt>
            <dd className="mt-1 break-words text-sm">
              {expired || !quoteUrl ? (
                <span className="text-gray-950">{expired ? 'Link expired' : '-'}</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <a href={quoteUrl} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 hover:underline">{quoteUrl}</a>
                  <CopyLinkButton value={quoteUrl} label="Copy" />
                  {active && <ExpireLinkButton quoteId={detail.quote.id} />}
                </div>
              )}
            </dd>
          </div>
          <Field label="Expires" value={formatDateTime(detail.quote.expiresAt)} />
          <Field label="Short code" value={expired ? '-' : (detail.quote.shortCode ?? '-')} />
          <Field label="Email gate" value={detail.quote.emailGateEnabled ? 'Enabled' : 'Disabled'} />
        </dl>
        <EmailGateSettingsForm
          action={saveEmailGate}
          enabled={detail.quote.emailGateEnabled}
          recipientEmails={detail.recipients.map((recipient) => recipient.email).join(', ')}
        />
      </Section>

      <Section title="Engagement">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Total opens" value={String(engagementData.totalOpens)} />
          <Field label="Unique viewers" value={String(engagementData.uniqueSessions)} />
          <Field label="Total time" value={formatDuration(engagementData.totalTimeMs)} />
          <Field label="Max scroll" value={`${engagementData.maxScrollDepth}%`} />
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Forwarding</dt>
            <dd className="mt-1">
              {engagementData.forwardingSuspected ? (
                <span className="inline-flex rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">Suspected</span>
              ) : (
                <span className="text-sm text-gray-950">No signal</span>
              )}
            </dd>
          </div>
        </dl>
        <div className="pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-950">Interest score</span>
            <span className="text-gray-600">{computedScore}/100</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded bg-gray-100">
            <div className="h-full rounded bg-[#142B3A]" style={{ width: `${computedScore}%` }} />
          </div>
        </div>
      </Section>

      <Section title="Viewers">
        {detail.quote.emailGateEnabled ? (
          <ViewerAnalyticsTable gated emails={detail.gatedEmailAnalytics} />
        ) : (
          <ViewerAnalyticsTable gated={false} devices={detail.viewerSessions} />
        )}
        {detail.notifiedViewers.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Notified viewers</p>
            <ul className="space-y-1">
              {detail.notifiedViewers.map((nv) => {
                const device = nv.deviceType ?? 'Unknown device'
                const location = nv.geoCity ?? 'unknown location'
                const isp = nv.geoIsp ? ` (ISP: ${nv.geoIsp})` : ''
                return (
                  <li key={`${nv.ipHash}::${nv.userAgentHash}`} className="text-sm text-gray-700">
                    {device} viewer from {location}{isp} &mdash; notified {formatDateTime(nv.notifiedAt)}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Section>

      {typeof notices.snapshotError === 'string' && (
        <DismissibleNotice tone="error" noticeKey={notices.snapshotError}>
          {notices.snapshotError}
        </DismissibleNotice>
      )}
      {notices.snapshotSaved === '1' && (
        <DismissibleNotice tone="success" noticeKey="snapshot-saved">
          Conversation Snapshot saved.
        </DismissibleNotice>
      )}
      {notices.snapshotSaved === 'partial' && (
        <DismissibleNotice tone="warning" noticeKey="snapshot-saved-partial">
          Conversation Snapshot saved with partial ServiceM8 context.
        </DismissibleNotice>
      )}
      {typeof notices.suggestionError === 'string' && (
        <DismissibleNotice tone="error" noticeKey={notices.suggestionError}>
          {notices.suggestionError}
        </DismissibleNotice>
      )}
      {notices.suggestionSaved === '1' && (
        <DismissibleNotice tone="success" noticeKey="suggestion-saved">
          AI Suggestion saved.
        </DismissibleNotice>
      )}
      <AiGuidancePanel
        guidance={detail.aiGuidance}
        quoteId={detail.quote.id}
        quoteUrl={quoteUrl}
        generateSnapshotAction={createConversationSnapshotAction}
        generateSuggestionAction={createAiSuggestionAction}
      />

      <Section title="Manual Status Override">
        <form action={saveManualTag} className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</span>
            <select
              name="tag"
              defaultValue={effectiveTag}
              className="mt-1 w-44 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950"
            >
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
              <option value="dead">Dead</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-[#142B3A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1d3d52]"
          >
            Save
          </button>
          {overrideTag && <span className="text-sm text-gray-500">Manual override active.</span>}
        </form>
      </Section>
    </div>
  )
}

function buildEngagementData(detail: NonNullable<Awaited<ReturnType<typeof getQuoteDetail>>>): EngagementData {
  const openDays = new Set(
    detail.events
      .filter((event) => event.eventType === 'open')
      .map((event) => event.createdAt.toISOString().slice(0, 10)),
  )

  return {
    totalOpens: detail.engagement?.totalOpens ?? detail.events.filter((event) => event.eventType === 'open').length,
    totalTimeMs: detail.engagement?.totalTimeMs ?? detail.events.reduce((sum, event) => sum + (event.durationMs ?? 0), 0),
    maxScrollDepth: detail.engagement?.maxScrollDepth ?? Math.max(0, ...detail.events.map((event) => event.scrollDepth ?? 0)),
    uniqueSessions: detail.engagement?.uniqueSessions ?? detail.viewerSessions.length,
    uniqueDevices: detail.engagement?.uniqueDevices ?? new Set(detail.events.map((event) => event.deviceType).filter(Boolean)).size,
    forwardingSuspected: detail.engagement?.forwardingSuspected ?? detail.viewerSessions.length > 1,
    hasCta: detail.events.some((event) => event.eventType === 'cta' || event.eventType === 'download'),
    hasReturnVisit: openDays.size >= 2,
    createdAt: detail.quote.createdAt,
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-gray-950">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-gray-950">{value}</dd>
    </div>
  )
}

function isStatusTag(value: FormDataEntryValue | null): value is StatusTag {
  return value === 'hot' || value === 'warm' || value === 'cold' || value === 'dead'
}
