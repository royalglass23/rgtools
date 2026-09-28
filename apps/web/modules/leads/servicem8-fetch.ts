import { eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit-db'
import { clients, leads } from '@rgtools/db/schema-leads'
import { DECISION_MATRIX, type MatrixFieldKey } from '@/modules/lead-intake/scoring/score-lead'
import { persistLeadScore } from '@/modules/lead-intake/scoring/persist-score'
import {
  createServiceM8RequestFromEnv,
  createServiceM8WriteRequestFromEnv,
  getCompanyContact,
  getJobContact,
  getJobQuoteMeta,
  resolveJobUuid,
  setJobLeadCardFields,
} from '@/lib/servicem8/client'
import type { ServiceM8FetchRequest, ServiceM8LeadJobCardFields } from '@/lib/servicem8/client'
import { resolveClient } from '@/modules/clients/client-resolver'
import { normalizeNzPhone } from '@/modules/lead-intake/intake-utils'
import { buildServiceM8LeadJobCardFields } from '@/modules/lead-intake/servicem8/payload'
import { isServiceM8QuoteStatus } from './lead-lifecycle'

// Re-exported for existing importers/tests that reference these from this module.
export { createServiceM8RequestFromEnv }
export type { ServiceM8FetchRequest }

type ServiceM8Job = {
  uuid?: string
  job_description?: string
  status?: string
  generated_job_id?: string | null
}

type ServiceM8InboxMessage = {
  converted_to_job_uuid?: string | null
  message_text?: string | null
  message_html?: string | null
  subject?: string | null
}

type ServiceM8QuoteMetaWithLeadFields = Omit<Awaited<ReturnType<typeof getJobQuoteMeta>>, 'leadJobCardFields'> & {
  leadJobCardFields?: Partial<ServiceM8LeadJobCardFields> | null
}

type LeadInsert = typeof leads.$inferInsert
type AutoFilledLeadFields = Partial<Pick<LeadInsert, 'clientTypeAnswer' | 'budgetBand' | 'projectType'>>
type JobCardPrefillResult = {
  autoFilledFields: AutoFilledLeadFields
  unmappedJobCardFields: string[]
}

export type LeadServiceM8FetchResult =
  | {
      ok: true
      jobUuid: string
      jobNumber: string | null
      jobStatus: string | null
      leadsQuality: string
      customFieldUpdated: boolean
      customFieldError?: string
    }
  | {
      ok: false
      reason: 'not_found' | 'error'
      message: string
    }

export type LeadServiceM8ManualLinkResult =
  | {
      ok: true
      jobUuid: string
      jobNumber: string
      jobStatus: string | null
      message: string
    }
  | {
      ok: false
      reason: 'not_found' | 'error'
      message: string
    }

export type LeadServiceM8ImportResult =
  | {
      ok: true
      leadId: string
      jobUuid: string
      jobNumber: string
      jobStatus: string | null
      reusedExisting: boolean
      missingContact: boolean
      message: string
    }
  | {
      ok: false
      reason: 'not_found' | 'not_quote' | 'error'
      message: string
    }

export async function fetchLeadFromServiceM8(
  leadId: string,
  actorId: string | null,
  options: { request?: ServiceM8FetchRequest } = {},
): Promise<LeadServiceM8FetchResult> {
  const request = options.request ?? createServiceM8RequestFromEnv()
  const [lead] = await db
    .select({
      id: leads.id,
      clientName: clients.name,
      companyName: clients.companyName,
      phone: clients.phone,
      email: clients.email,
      channel: leads.channel,
      source: leads.source,
      tier: leads.tier,
      seedScore: leads.seedScore,
      scoreReason: leads.scoreReason,
      strikeFlag: leads.strikeFlag,
      completeness: leads.completeness,
      clientProfileKey: leads.clientTypeAnswer,
      projectType: leads.product,
      complexity: leads.projectType,
      budgetBand: leads.budgetBand,
      consentStatus: leads.consentStatus,
      priceSensitivityRead: leads.priceSensitivity,
      decisionMakers: leads.decisionMakers,
      distanceBand: leads.distanceBand,
      paymentHistory: leads.paymentHistory,
      siteAccess: leads.siteAccess,
      installationHeight: leads.installationHeight,
      freeText: leads.jobDescription,
      location: leads.location,
      suburb: leads.suburb,
      servicem8JobUuid: leads.servicem8JobUuid,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(eq(leads.id, leadId))
    .limit(1)

  if (!lead) {
    return { ok: false, reason: 'error', message: 'Lead not found' }
  }

  // Already-linked leads (e.g. imported) have no "RGTools Lead" tag in ServiceM8 descriptions,
  // so skip the description search and refresh directly by the known UUID.
  const matchingJob = lead.servicem8JobUuid
    ? await fetchJobByUuid(request, lead.servicem8JobUuid)
    : await findMatchingJob(request, `RGTools Lead ${leadId}`, lead.createdAt)

  if (!matchingJob?.uuid) {
    return {
      ok: false,
      reason: 'not_found',
      message: 'No matching job found in ServiceM8 yet',
    }
  }

  const wasAlreadyLinked = Boolean(lead.servicem8JobUuid)
  const leadsQuality = lead.tier ? `Leads Quality ${lead.tier}` : 'Not set'
  const jobNumber = matchingJob.generated_job_id ?? null
  const jobStatus = matchingJob.status ?? null
  const jobCardFields = buildServiceM8LeadJobCardFields({
    leadId: lead.id,
    servicem8JobUuid: lead.servicem8JobUuid,
    clientName: lead.clientName,
    companyName: lead.companyName,
    phone: lead.phone,
    email: lead.email,
    channel: lead.channel,
    source: lead.source,
    projectType: lead.projectType,
    location: lead.location,
    suburb: lead.suburb,
    clientProfileKey: lead.clientProfileKey,
    budgetBand: lead.budgetBand,
    consentStatus: lead.consentStatus,
    complexity: lead.complexity,
    priceSensitivityRead: lead.priceSensitivityRead,
    decisionMakers: lead.decisionMakers,
    distanceBand: lead.distanceBand,
    paymentHistory: lead.paymentHistory,
    siteAccess: lead.siteAccess,
    installationHeight: lead.installationHeight,
    freeText: lead.freeText,
    seedScore: lead.seedScore,
    tier: lead.tier,
    scoreReason: lead.scoreReason,
    strikeFlag: lead.strikeFlag,
    completeness: lead.completeness,
    updatedAt: lead.updatedAt,
  })
  let customFieldUpdated = false
  let customFieldError: string | undefined

  if (!wasAlreadyLinked && hasLeadJobCardContent(jobCardFields)) {
    try {
      const writeResult = await setJobLeadCardFields(
        matchingJob.uuid,
        jobCardFields,
        createServiceM8WriteRequestFromEnv(),
      )
      customFieldUpdated = writeResult.updated.length > 0
      customFieldError = writeResult.skipped.length > 0
        ? `Missing ServiceM8 field config for ${writeResult.skipped.join(', ')}`
        : undefined
    } catch (error) {
      customFieldError = error instanceof Error ? error.message : String(error)
    }
  }

  await db
    .update(leads)
    .set({
      servicem8JobUuid: matchingJob.uuid,
      servicem8JobNumber: jobNumber,
      servicem8Status: jobStatus,
      syncStatus: 'synced',
      syncError: null,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId))

  await logAudit({
    actorId: actorId ?? null,
    entityType: 'lead',
    action: 'lead.servicem8_fetch',
    targetId: leadId,
    before: null,
    after: {
      jobUuid: matchingJob.uuid,
      jobStatus,
      leadsQuality,
      customFieldUpdated,
      customFieldError,
      jobCardFields,
    },
  })

  return {
    ok: true,
    jobUuid: matchingJob.uuid,
    jobNumber,
    jobStatus,
    leadsQuality,
    customFieldUpdated,
    customFieldError,
  }
}

export async function importLeadFromServiceM8JobNumber(
  jobNumber: string,
  actorId: string | null,
  options: { request?: ServiceM8FetchRequest } = {},
): Promise<LeadServiceM8ImportResult> {
  const request = options.request ?? createServiceM8RequestFromEnv()
  const normalizedJobNumber = jobNumber.trim().toUpperCase()
  if (!normalizedJobNumber) {
    return { ok: false, reason: 'error', message: 'Enter a ServiceM8 job number' }
  }

  const jobUuid = await resolveJobUuid({ jobNumber: normalizedJobNumber }, request)
  if (!jobUuid) {
    return {
      ok: false,
      reason: 'not_found',
      message: `No ServiceM8 job found with number ${normalizedJobNumber}`,
    }
  }

  const meta = await getJobQuoteMeta(jobUuid, request) as ServiceM8QuoteMetaWithLeadFields
  const resolvedJobNumber = meta.jobNumber ?? normalizedJobNumber
  if (!isServiceM8QuoteStatus(meta.status)) {
    return {
      ok: false,
      reason: 'not_quote',
      message: `ServiceM8 job ${resolvedJobNumber} is ${meta.status ?? 'not Quote'}, not Quote. Import a Quote job only.`,
    }
  }

  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(or(
      eq(leads.servicem8JobUuid, meta.jobUuid),
      eq(leads.servicem8JobNumber, resolvedJobNumber),
    ))
    .limit(1)

  if (existing) {
    return {
      ok: true,
      leadId: existing.id,
      jobUuid: meta.jobUuid,
      jobNumber: resolvedJobNumber,
      jobStatus: meta.status,
      reusedExisting: true,
      missingContact: false,
      message: `Opened existing lead for job ${resolvedJobNumber}.`,
    }
  }

  const jobContact = await getJobContact(meta.jobUuid, request)
  const contact = hasContactDetail(jobContact)
    ? jobContact
    : meta.companyUuid
      ? await getCompanyContact(meta.companyUuid, request)
      : null
  const phone = contact?.mobile || contact?.phone || null
  const email = contact?.email || null
  const missingContact = !phone && !email
  const clientName = meta.clientName || contact?.name || `ServiceM8 job ${resolvedJobNumber}`
  const projectType = deriveProjectType(meta.jobDescription)
  const prefill = buildJobCardPrefill(meta)
  const wasScored = hasAutoFilledFields(prefill.autoFilledFields)
  const freeText = missingContact
    ? '[Import flag] Missing phone/email in ServiceM8 at import time.'
    : null
  const now = new Date()
  let createdLeadId = ''

  await db.transaction(async (tx) => {
    const resolved = await resolveClient(tx, {
      servicem8CompanyUuid: meta.companyUuid,
      clientName,
      companyName: meta.clientName,
      phone,
      phoneNormalized: phone ? normalizeNzPhone(phone) : null,
      email,
      servicem8SourceSnapshot: {
        source: 'lead-import',
        jobUuid: meta.jobUuid,
        jobNumber: resolvedJobNumber,
        status: meta.status,
        companyUuid: meta.companyUuid,
        clientName: meta.clientName,
        jobDescription: meta.jobDescription,
        jobAddress: meta.jobAddress,
        contact,
      },
    })

    const [createdLead] = await tx
      .insert(leads)
      .values({
        clientId: resolved.clientId,
        contactId: resolved.contactId,
        channel: 'other',
        externalRef: resolvedJobNumber,
        syncStatus: 'synced',
        servicem8JobUuid: meta.jobUuid,
        servicem8JobNumber: resolvedJobNumber,
        servicem8Status: meta.status,
        product: projectType,
        ...prefill.autoFilledFields,
        location: meta.jobAddress,
        jobDescription: freeText,
        freeText,
        createdBy: actorId,
        updatedAt: now,
      })
      .returning({ id: leads.id })

    createdLeadId = createdLead.id

    await logAudit({
      actorId,
      entityType: 'lead',
      action: 'lead.servicem8_import',
      targetId: createdLeadId,
      before: null,
      after: {
        jobUuid: meta.jobUuid,
        jobNumber: resolvedJobNumber,
        jobStatus: meta.status,
        missingContact,
        autoFilledFields: prefill.autoFilledFields,
        unmappedJobCardFields: prefill.unmappedJobCardFields,
        needsScoring: !wasScored,
      },
    }, tx)
  })

  if (wasScored) {
    await persistLeadScore(createdLeadId, actorId)
  }

  return {
    ok: true,
    leadId: createdLeadId,
    jobUuid: meta.jobUuid,
    jobNumber: resolvedJobNumber,
    jobStatus: meta.status,
    reusedExisting: false,
    missingContact,
    message: buildImportSuccessMessage(resolvedJobNumber, {
      missingContact,
      wasScored,
    }),
  }
}

export async function linkLeadToServiceM8JobByNumber(
  leadId: string,
  jobNumber: string,
  actorId: string | null,
  options: { request?: ServiceM8FetchRequest } = {},
): Promise<LeadServiceM8ManualLinkResult> {
  const request = options.request ?? createServiceM8RequestFromEnv()
  const normalizedJobNumber = jobNumber.trim().toUpperCase()
  const normalizedLeadIdentifier = leadId.trim().toUpperCase()

  if (!normalizedJobNumber) {
    return { ok: false, reason: 'error', message: 'Enter a ServiceM8 job number' }
  }

  const [leadById] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1)

  const [leadByJobNumber] = leadById ? [] : await db
    .select({ id: leads.id })
    .from(leads)
    .where(or(
      eq(leads.servicem8JobNumber, normalizedLeadIdentifier),
      eq(leads.externalRef, normalizedLeadIdentifier),
    ))
    .limit(1)

  const lead = leadById ?? leadByJobNumber

  if (!lead) {
    return { ok: false, reason: 'error', message: 'Lead not found' }
  }

  const jobUuid = await resolveJobUuid({ jobNumber: normalizedJobNumber }, request)
  if (!jobUuid) {
    return {
      ok: false,
      reason: 'not_found',
      message: `No ServiceM8 job found with number ${normalizedJobNumber}`,
    }
  }

  const job = await fetchJobByUuid(request, jobUuid)
  if (!job?.uuid) {
    return {
      ok: false,
      reason: 'not_found',
      message: `No ServiceM8 job found with number ${normalizedJobNumber}`,
    }
  }

  const resolvedJobNumber = job.generated_job_id ?? normalizedJobNumber
  const jobStatus = job.status ?? null

  if (!isServiceM8QuoteStatus(jobStatus)) {
    return {
      ok: false,
      reason: 'error',
      message: `ServiceM8 job ${resolvedJobNumber} is ${jobStatus ?? 'not Quote'}, not Quote. Choose a Quote job to link this lead.`,
    }
  }

  await db
    .update(leads)
    .set({
      servicem8JobUuid: job.uuid,
      servicem8JobNumber: resolvedJobNumber,
      servicem8Status: jobStatus,
      syncStatus: 'synced',
      syncError: null,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, lead.id))

  await logAudit({
    actorId: actorId ?? null,
    entityType: 'lead',
    action: 'lead.servicem8_manual_link',
    targetId: lead.id,
    before: null,
    after: {
      jobUuid: job.uuid,
      jobNumber: resolvedJobNumber,
      jobStatus,
    },
  })

  return {
    ok: true,
    jobUuid: job.uuid,
    jobNumber: resolvedJobNumber,
    jobStatus,
    message: `Linked to job ${resolvedJobNumber}${jobStatus ? ` (${jobStatus})` : ''}`,
  }
}

function hasContactDetail(contact: { phone: string | null; mobile: string | null; email: string | null } | null): boolean {
  return Boolean(contact?.phone || contact?.mobile || contact?.email)
}

function deriveProjectType(description: string | null | undefined) {
  const normalized = (description ?? '').toLowerCase()
  if (normalized.includes('pool')) return 'pool_fence'
  if (normalized.includes('balustrade') || normalized.includes('balcony')) return 'balustrade'
  if (normalized.includes('shower')) return 'shower'
  if (normalized.includes('handrail')) return 'handrail'
  return 'other'
}

function buildJobCardPrefill(meta: ServiceM8QuoteMetaWithLeadFields): JobCardPrefillResult {
  const autoFilledFields: AutoFilledLeadFields = {}
  const unmappedJobCardFields: string[] = []
  const clientTypeAnswer = optionKeyForLabel('clientType', meta.leadJobCardFields?.clientType)
  const projectTypeInput = meta.leadJobCardFields?.projectType ?? noteValueForLabel(meta.leadJobCardFields?.note, 'Project Type')
  const projectType = optionKeyForLabel(
    'projectType',
    projectTypeInput,
  )
  const budgetBand = budgetBandForQuoteValue(meta.quoteValue)

  if (clientTypeAnswer) {
    autoFilledFields.clientTypeAnswer = clientTypeAnswer as AutoFilledLeadFields['clientTypeAnswer']
  } else if (hasJobCardValue(meta.leadJobCardFields?.clientType)) {
    unmappedJobCardFields.push('clientType')
  }

  if (budgetBand) autoFilledFields.budgetBand = budgetBand

  if (projectType) {
    autoFilledFields.projectType = projectType as AutoFilledLeadFields['projectType']
  } else if (hasJobCardValue(projectTypeInput)) {
    unmappedJobCardFields.push('projectType')
  }

  return { autoFilledFields, unmappedJobCardFields }
}

function hasAutoFilledFields(fields: AutoFilledLeadFields): boolean {
  return Object.keys(fields).length > 0
}

function hasJobCardValue(value: string | null | undefined): boolean {
  return Boolean(normalizeMatrixValue(value))
}

function optionKeyForLabel(fieldKey: MatrixFieldKey, label: string | null | undefined): string | undefined {
  const normalizedLabel = normalizeMatrixValue(label)
  if (!normalizedLabel) return undefined

  return DECISION_MATRIX.fields
    .find((field) => field.key === fieldKey)
    ?.options.find((option) =>
      normalizeMatrixValue(option.key) === normalizedLabel ||
      normalizeMatrixValue(option.label) === normalizedLabel
    )?.key
}

function budgetBandForQuoteValue(value: string | null | undefined): AutoFilledLeadFields['budgetBand'] | undefined {
  const quoteValue = Number(value)
  if (!Number.isFinite(quoteValue) || quoteValue <= 0) return undefined
  if (quoteValue >= 50000) return '50k_plus'
  if (quoteValue >= 20000) return '20k_50k'
  if (quoteValue >= 5000) return '5k_20k'
  return 'lt_5k'
}

function normalizeMatrixValue(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized || undefined
}

function noteValueForLabel(note: string | null | undefined, label: string): string | undefined {
  const cleanedNote = note?.trim()
  if (!cleanedNote) return undefined

  const labelPattern = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${labelPattern}\\s*:\\s*([^|\\n\\r]+)`, 'i').exec(cleanedNote)
  return match?.[1]?.trim() || undefined
}

function buildImportSuccessMessage(
  jobNumber: string,
  result: { missingContact: boolean; wasScored: boolean },
): string {
  if (result.missingContact && result.wasScored) {
    return `Imported and scored job ${jobNumber}. Contact details are missing and need manual follow-up.`
  }

  if (result.missingContact) {
    return `Imported job ${jobNumber}. Contact details are missing and need manual follow-up.`
  }

  if (result.wasScored) {
    return `Imported and scored job ${jobNumber}.`
  }

  return `Imported job ${jobNumber}.`
}

async function fetchJobByUuid(
  request: ServiceM8FetchRequest,
  jobUuid: string,
): Promise<ServiceM8Job | undefined> {
  const response = await request(`/job/${jobUuid}.json`)
  if (!response.ok) return undefined
  const job = await response.json()
  if (!job || typeof job !== 'object') return undefined
  return job as ServiceM8Job
}

function hasLeadJobCardContent(fields: ReturnType<typeof buildServiceM8LeadJobCardFields>): boolean {
  return Boolean(fields.jobDescription || fields.clientType || fields.leadsQuality)
}

async function findMatchingJob(
  request: ServiceM8FetchRequest,
  reference: string,
  leadCreatedAt: Date,
): Promise<ServiceM8Job | undefined> {
  // One-day margin guards against timezone skew between Neon and ServiceM8 job dates.
  const sinceDate = new Date(leadCreatedAt.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const filter = encodeURIComponent(`date gt '${sinceDate}'`)
  const jobsResponse = await request(`/job.json?%24filter=${filter}`)
  if (!jobsResponse.ok) {
    throw new Error(`ServiceM8 job search failed with HTTP ${jobsResponse.status}`)
  }

  const jobs = await jobsResponse.json()
  const matchingJob = Array.isArray(jobs)
    ? jobs.find((job): job is ServiceM8Job => {
        if (!job || typeof job !== 'object') return false
        const candidate = job as ServiceM8Job
        return Boolean(
          candidate.uuid &&
          candidate.job_description?.includes(reference),
        )
      })
    : undefined

  return matchingJob ?? findMatchingInboxJob(request, reference)
}

async function findMatchingInboxJob(
  request: ServiceM8FetchRequest,
  reference: string,
): Promise<ServiceM8Job | undefined> {
  const inboxResponse = await request('/inboxmessage.json?limit=500&offset=0&filter=all')
  if (!inboxResponse.ok) {
    throw new Error(`ServiceM8 inbox search failed with HTTP ${inboxResponse.status}`)
  }

  const inboxPayload = await inboxResponse.json()
  const messages = inboxPayload && typeof inboxPayload === 'object' && 'messages' in inboxPayload
    ? (inboxPayload as { messages?: unknown }).messages
    : undefined

  if (!Array.isArray(messages)) return undefined

  const matchingMessage = messages.find((message): message is ServiceM8InboxMessage => {
    if (!message || typeof message !== 'object') return false
    const candidate = message as ServiceM8InboxMessage
    return Boolean(
      candidate.converted_to_job_uuid &&
      (
        candidate.message_text?.includes(reference) ||
        candidate.message_html?.includes(reference) ||
        candidate.subject?.includes(reference)
      ),
    )
  })

  if (!matchingMessage?.converted_to_job_uuid) return undefined

  const jobResponse = await request(`/job/${matchingMessage.converted_to_job_uuid}.json`)
  if (!jobResponse.ok) {
    throw new Error(`ServiceM8 job retrieve failed with HTTP ${jobResponse.status}`)
  }

  const job = await jobResponse.json()
  if (!job || typeof job !== 'object') return undefined
  return job as ServiceM8Job
}
