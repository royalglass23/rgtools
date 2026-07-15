import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireModule } from '@/lib/guard'
import {
  addWorkOrderTimelineNoteAction,
  generateWorkOrderAiSuggestionAction,
} from '@/modules/work-orders/actions'
import { WORK_ORDER_AI_SUGGESTION_COOLDOWN_MS } from '@/modules/work-orders/domain'
import { getCurrentWorkOrderPermissions } from '@/modules/work-orders/permissions'
import { getWorkOrderDetail } from '@/modules/work-orders/queries'
import { DismissibleNotice } from '@/modules/ui/DismissibleNotice'

export default async function WorkOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireModule('work-orders')
  const { id } = await params
  const notices = await searchParams
  const [detail, permissions] = await Promise.all([
    getWorkOrderDetail(id),
    getCurrentWorkOrderPermissions(),
  ])

  if (!detail) notFound()
  const aiCooldownUntil = detail.aiSuggestionAt
    ? new Date(detail.aiSuggestionAt.getTime() + WORK_ORDER_AI_SUGGESTION_COOLDOWN_MS)
    : null
  const aiCooldownActive = Boolean(aiCooldownUntil && aiCooldownUntil > new Date())
  const redirectedCooldownUntil = typeof notices.aiRefreshCooldownUntil === 'string'
    ? formatDateTime(new Date(notices.aiRefreshCooldownUntil))
    : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/work-orders" className="text-sm font-medium text-[#142B3A] hover:underline">Back to Work Orders</Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-950">{detail.clientName}</h1>
          {detail.companyName && <p className="mt-1 text-sm text-gray-500">{detail.companyName}</p>}
        </div>
        <span className="rounded border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700">
          {detail.isCurrent ? 'Current' : 'Non-current'} · {detail.servicem8Active ? 'ServiceM8 active' : 'ServiceM8 inactive'}
        </span>
      </div>

      <Section title="Job Summary">
        <dl className="grid gap-4 sm:grid-cols-4">
          <Field label="Job number" value={detail.jobNumber} />
          <Field label="Address" value={detail.jobAddress} />
          <Field label="Status" value={detail.servicem8Status} />
          <Field label="Lead score" value={detail.leadScore?.toString() ?? null} />
          <Field label="Description" value={detail.jobDescription} className="sm:col-span-2" />
        </dl>
      </Section>

      <Section title="Work Order Items">
        <div className="space-y-3">
          {detail.items.map((workOrderItem) => {
            const effectiveLabel = workOrderItem.manualLabelOverride
              ?? workOrderItem.generatedLabel
              ?? workOrderItem.originalDescription
            return (
              <article key={workOrderItem.id} className="rounded border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-gray-950">{effectiveLabel}</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Qty {workOrderItem.quantity} · {workOrderItem.itemCode ?? 'No item code'}
                    </p>
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${workOrderItem.isActive ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
                    {workOrderItem.isActive ? 'Active' : 'Removed'}
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Installer" value={workOrderItem.installerName} />
                  <Field label="Stage" value={workOrderItem.stageName} />
                  <Field label="Hardware" value={workOrderItem.hardwareStatusName} />
                  <Field label="Maintenance Program" value={workOrderItem.maintenanceProgram ? 'Yes' : 'No'} />
                  <Field label="Install date" value={workOrderItem.installDate} />
                  <Field label="Date completed" value={workOrderItem.dateCompleted} />
                  <Field label="Risk" value={workOrderItem.riskLevel ? titleCase(workOrderItem.riskLevel) : null} />
                  <Field label="Importance" value={workOrderItem.importance ? titleCase(workOrderItem.importance) : null} />
                  <Field label="Original ServiceM8 description" value={workOrderItem.originalDescription} className="sm:col-span-2" />
                  <Field label="Line total excluding GST" value={formatMoney(workOrderItem.lineTotalExcludingGst)} />
                </dl>
              </article>
            )
          })}
          {detail.items.length === 0 && (
            <p className="text-sm text-gray-500">No Work Order Items have been synced yet.</p>
          )}
        </div>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-950">Client Context</h2>
            {permissions.canManage && (
              <form action={generateWorkOrderAiSuggestionAction.bind(null, detail.id)}>
                <button
                  type="submit"
                  disabled={aiCooldownActive}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                >
                  {aiCooldownActive ? `Available ${formatRelativeCooldown(aiCooldownUntil)}` : 'Refresh AI Suggestion'}
                </button>
              </form>
            )}
          </div>
          {redirectedCooldownUntil && (
            <div className="mt-3">
              <DismissibleNotice tone="warning" noticeKey={redirectedCooldownUntil}>
                AI suggestion was refreshed recently. Try again after {redirectedCooldownUntil}.
              </DismissibleNotice>
            </div>
          )}
          <dl className="mt-4 space-y-3">
            <Field label="Client notes" value={detail.clientNotes} />
            <Field label="Client Context Summary" value={detail.clientContextSummary} />
            <Field label="AI Suggestion" value={detail.aiSuggestion} />
          </dl>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Contacts</h3>
          <ul className="mt-2 divide-y divide-gray-100">
            {detail.contacts.map((contact) => (
              <li key={contact.id} className="py-2 text-sm">
                <span className="font-medium text-gray-900">{contact.name ?? 'Unnamed contact'}</span>
                {contact.isJobContact && <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">Job contact</span>}
                <span className="block text-gray-600">{contact.phone ?? 'No phone'} · {contact.email ?? 'No email'}</span>
              </li>
            ))}
            {detail.contacts.length === 0 && <li className="py-3 text-sm text-gray-500">No linked client contacts yet.</li>}
          </ul>
        </section>

        <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-950">Project Timeline</h2>
          {permissions.canManage && (
            <form action={addWorkOrderTimelineNoteAction.bind(null, detail.id)} className="mt-4 flex gap-2">
              <input name="note" className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950" placeholder="Add timeline note" />
              <button type="submit" className="rounded bg-[#142B3A] px-3 py-2 text-sm font-medium text-white hover:bg-[#1d3d52]">
                Add note
              </button>
            </form>
          )}
          <ul className="mt-4 divide-y divide-gray-100">
            {detail.timeline.map((event) => (
              <li key={event.id} className="py-3 text-sm">
                <span className="font-medium text-gray-900">{eventLabel(event.fieldName)}</span>
                <span className="ml-2 text-xs text-gray-500">{formatDateTime(event.createdAt)}</span>
                {event.actorUsername && <span className="ml-2 text-xs text-gray-500">by {event.actorUsername}</span>}
                {event.itemLabel && (
                  <span className="block text-xs font-medium text-sky-800">
                    Affected item: {event.itemCode ? `${event.itemCode} - ` : ''}{event.itemLabel}
                  </span>
                )}
                <span className="block text-gray-600">{String(event.note ?? event.newValue ?? '-')}</span>
                {event.isClientVisibleCandidate && event.portalTitle && (
                  <span className="mt-1 block text-xs font-medium text-green-700">Portal candidate: {event.portalTitle}</span>
                )}
              </li>
            ))}
            {detail.timeline.length === 0 && <li className="py-3 text-sm text-gray-500">No timeline entries yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-gray-950">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, value, className }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-gray-950">{value || '-'}</dd>
    </div>
  )
}

function eventLabel(value: string) {
  return value.split('_').map(titleCase).join(' ')
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatRelativeCooldown(value: Date | null) {
  if (!value) return 'soon'
  const minutes = Math.max(1, Math.ceil((value.getTime() - Date.now()) / 60_000))
  return `in ${minutes} min`
}

function formatMoney(value: string | null) {
  if (!value) return null
  const amount = Number(value)
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : value
}
