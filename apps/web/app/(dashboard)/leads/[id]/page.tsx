import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { userCanAccessSlug } from '@/lib/access-db'
import { getLeadDetail } from '@/modules/leads/queries'
import { ServiceM8FetchButton } from '@/modules/leads/ServiceM8FetchButton'
import { DeleteLeadButton } from '@/modules/leads/DeleteLeadButton'
import { LeadAiGuidancePanel } from '@/modules/leads/LeadAiGuidancePanel'
import { ReviewerNotesSection } from '@/modules/leads/ReviewerNotesSection'
import { getLeadReviewerNotes } from '@/modules/leads/reviewer-notes'
import { getLatestLeadAiGuidance } from '@/modules/leads/ai-guidance'
import { isLeadReadOnlyForLeadIntake } from '@/modules/leads/lead-lifecycle'
import { formatAnswerKey, formatLeadSource, formatProjectType } from '@/modules/lead-intake/display-labels'
import { DismissibleNotice } from '@/modules/ui/DismissibleNotice'
import { deleteLeadAction, generateLeadGuidanceAction } from './actions'
import { addReviewerNoteAction } from './reviewer-notes-actions'

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const notices = await searchParams
  const [lead, session] = await Promise.all([getLeadDetail(id), auth()])
  if (!lead) notFound()

  const scoreSummaryTier = lead.tier ?? 'Needs scoring'
  const isReadOnly = isLeadReadOnlyForLeadIntake(lead)
  const boundDeleteAction = deleteLeadAction.bind(null, lead.id)
  const intakeSaved = notices.intakeSaved === 'updated' ? 'updated' : notices.intakeSaved === 'added' ? 'added' : null
  const canUseLeads = session?.user?.id ? await userCanAccessSlug(session.user.id, 'leads') : false
  const [reviewerNotes, aiGuidance] = await Promise.all([
    canUseLeads ? getLeadReviewerNotes(lead.id) : Promise.resolve([]),
    getLatestLeadAiGuidance(lead.id),
  ])
  const projectTypeLabel = findScoredFieldAnswer(lead.scoredFields, ['Project Type']) ?? formatAnswerKey(lead.projectType)
  const productLabel = formatProjectType(lead.product ?? lead.projectType)
  const channelLabel = formatLeadSource(lead.channel)
  const aiGuidanceDisabledReason = !lead.servicem8JobUuid
    ? 'Link this lead to ServiceM8 to generate AI Guidance.'
    : isReadOnly
      ? 'AI Guidance is paused while this ServiceM8 job is no longer Quote.'
      : undefined
  const sourceDetail = findScoredFieldAnswer(lead.scoredFields, ['Source']) ?? formatLeadSource(lead.source)
  const jobDescription = buildJobDescription({
    projectType: projectTypeLabel,
    product: productLabel,
    address: lead.location,
  })
  const contactReview = lead.contactReview

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/leads" className="text-sm text-gray-500 hover:text-gray-900">Back to leads</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-950">{lead.clientName}</h1>
            <TierBadge tier={lead.tier} />
          </div>
          {lead.companyName && <p className="mt-1 text-sm text-gray-500">{lead.companyName}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <Link
              href={`/lead-intake?leadId=${lead.id}`}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </Link>
          )}
          {session?.user?.role === 'admin' && (
            <form action={boundDeleteAction}>
              <DeleteLeadButton clientName={lead.clientName} />
            </form>
          )}
        </div>
      </div>

      {intakeSaved && (
        <DismissibleNotice tone="success" noticeKey={intakeSaved}>
          Lead {intakeSaved} and scored successfully.
        </DismissibleNotice>
      )}

      {isReadOnly && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This lead is read-only because ServiceM8 status is {lead.servicem8Status ?? 'not Quote'}. Lead-intake edits are paused, but you can still fetch from ServiceM8 to refresh the status.
        </div>
      )}

      {contactReview && (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="note">
          <strong>Client review note:</strong> {contactReview.message}
          {contactReview.matches.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-3">
              {contactReview.matches.map(({ kind, clientId }, index) => {
                const sameKindCount = contactReview.matches.filter((match) => match.kind === kind).length
                const position = contactReview.matches.slice(0, index + 1).filter((match) => match.kind === kind).length
                return (
                  <Link key={`${kind}-${clientId}`} href={`/clients/${clientId}`} className="font-medium underline">
                    View client matching {kind}{sameKindCount > 1 ? ` ${position}` : ''}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}

      <Section title="Client">
        <dl className="grid gap-4 sm:grid-cols-4">
          <Field label="Job Number" value={lead.servicem8JobNumber ?? '-'} />
          <Field label="Name" value={lead.clientName} />
          <Field label="Company" value={lead.companyName ?? '-'} />
          <Field label="Project Type" value={projectTypeLabel} />
          <Field label="Job Address" value={lead.location ?? '-'} className="sm:col-span-2" />
          <Field label="Email" value={lead.email ?? '-'} />
          <Field label="Phone" value={lead.phone ?? '-'} />
          <Field label="Channel" value={channelLabel} />
          <Field label="Source" value={sourceDetail} />
        </dl>
      </Section>

      <Section title="Notes">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Job Description" value={jobDescription} className="sm:col-span-2" />
          <Field label="Follow-up date" value={formatNullableDate(lead.followUpDate)} />
          <Field label="Last update" value={formatDateTime(lead.updatedAt)} />
          <Field label="Free notes" value={lead.freeText ?? '-'} className="sm:col-span-2" />
        </dl>
      </Section>

      {canUseLeads && (
        <Section title="Reviewer Notes">
          <ReviewerNotesSection
            leadId={lead.id}
            initialNotes={reviewerNotes.map((note) => ({
              ...note,
              createdAt: note.createdAt.toISOString(),
            }))}
            addNoteAction={addReviewerNoteAction}
          />
        </Section>
      )}

      <Section title="Scored Fields">
        <div className="overflow-hidden rounded border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Selected answer</th>
                <th className="px-4 py-3">Points earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lead.scoredFields.map((field) => (
                <tr key={field.category}>
                  <td className="px-4 py-3 font-medium text-gray-900">{field.label}</td>
                  <td className="px-4 py-3 text-gray-700">{field.answer}</td>
                  <td className="px-4 py-3 text-gray-700">{field.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Score Summary">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label="Tier" value={scoreSummaryTier} />
          <Field label="Score" value={lead.seedScore === null ? '-' : String(lead.seedScore)} />
          <Field label="Completeness" value={lead.completeness === null ? '-' : `${lead.completeness}%`} />
        </dl>
      </Section>

      {typeof notices.aiGuidanceError === 'string' && (
        <DismissibleNotice tone="error" noticeKey={notices.aiGuidanceError}>
          {notices.aiGuidanceError}
        </DismissibleNotice>
      )}
      {notices.aiGuidanceSaved === '1' && (
        <DismissibleNotice tone="success" noticeKey="ai-guidance-saved">
          AI Suggestion saved.
        </DismissibleNotice>
      )}
      <LeadAiGuidancePanel
        leadId={lead.id}
        guidance={aiGuidance}
        generateGuidanceAction={generateLeadGuidanceAction}
        generationDisabledReason={aiGuidanceDisabledReason}
      />

      <Section title="ServiceM8">
        <ServiceM8FetchButton
          leadId={lead.id}
          initialJobUuid={lead.servicem8JobUuid}
          initialJobNumber={lead.servicem8JobNumber}
          initialJobStatus={lead.servicem8Status}
          initialLeadsQuality={lead.tier ? `Leads Quality ${lead.tier}` : 'Not set'}
        />
      </Section>
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

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-gray-950">{value}</dd>
    </div>
  )
}

function formatNullableDate(date: Date | string | null) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date))
}

function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

function findScoredFieldAnswer(fields: Array<{ label: string; answer: string }>, labels: string[]) {
  const normalizedLabels = labels.map((label) => label.toLowerCase())
  const field = fields.find((candidate) => normalizedLabels.includes(candidate.label.toLowerCase()))
  if (!field || field.answer === 'Not selected') return null
  return formatAnswerKey(field.answer)
}

function buildJobDescription({
  projectType,
  product,
  address,
}: {
  projectType: string
  product: string | null
  address: string | null
}) {
  const parts = [projectType === '-' ? null : projectType]
  if (product && product !== projectType) parts.push(product)
  const description = parts.filter(Boolean).join(' ')
  if (!description && !address) return '-'
  if (!description) return address ?? '-'
  return address ? `${description} in ${address}` : description
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) {
    return <span className="inline-flex rounded px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-700">Needs scoring</span>
  }

  const classes = {
    A: 'bg-green-100 text-green-800',
    B: 'bg-blue-100 text-blue-800',
    C: 'bg-yellow-100 text-yellow-800',
    D: 'bg-gray-100 text-gray-700',
    E: 'bg-slate-100 text-slate-700',
  }[tier] ?? 'bg-gray-100 text-gray-700'

  return <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${classes}`}>{tier}</span>
}
