import { currentQuoteStats } from '@/modules/quote-tracker/current-stats'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  getJobConversationSnapshotHistory,
  type ServiceM8ConversationSnapshotHistory,
} from '@/lib/servicem8/client'
import { getLatestLeadAiGuidance } from '@/modules/leads/ai-guidance'
import { getLeadReviewerNotes, type ReviewerNote } from '@/modules/leads/reviewer-notes'
import { getLatestQuoteAiGuidance } from '@/modules/quote-tracker/ai-guidance'
import {
  quoteEngagement,
  quotes,
} from '@rgtools/db/schema'
import {
  clientContacts,
  clients,
  leads,
} from '@rgtools/db/schema-leads'
import {
  buildServiceM8FileContext,
  type ServiceM8FileContext,
} from './servicem8-file-context'

export type LifecycleClientContext = {
  id: string
  servicem8CompanyUuid: string | null
  name: string
  companyName: string | null
  email: string | null
  phone: string | null
  identityType: string | null
  reviewStatus: string
  updatedAt: Date
}

export type LifecycleContactContext = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  phoneNormalized: string | null
  updatedAt: Date
}

export type LifecycleLeadContext = {
  id: string
  clientId: string
  contactId: string | null
  clientName: string
  companyName: string | null
  phone: string | null
  email: string | null
  location: string | null
  channel: string
  source: string | null
  product: string | null
  projectType: string | null
  jobDescription: string | null
  tier: string | null
  seedScore: number | null
  completeness: number | null
  scoreReason: string | null
  servicem8JobUuid: string | null
  servicem8JobNumber: string | null
  servicem8Status: string | null
  createdAt: Date
  updatedAt: Date
  client: LifecycleClientContext
  contacts: LifecycleContactContext[]
}

export type LifecycleQuoteContext = {
  id: string
  servicem8Uuid: string
  servicem8CompanyUuid: string | null
  clientId: string | null
  clientName: string
  companyName: string | null
  jobDescription: string | null
  jobAddress: string | null
  quoteValue: string | null
  statusTag: string | null
  aiScore: number | null
  pipelineStage: string
  createdAt: Date
  updatedAt: Date
  engagement: {
    totalOpens: number
    uniqueSessions: number
    totalTimeMs: number
    maxScrollDepth: number
    forwardingSuspected: boolean
    lastOpenedAt: Date | null
  } | null
}

export type LifecycleGuidanceRecord = {
  id: string
  createdAt?: Date
  capturedAt?: Date
  [key: string]: unknown
}

export type LifecycleGuidanceContext = {
  conversationSnapshot: LifecycleGuidanceRecord | null
  aiSuggestion: LifecycleGuidanceRecord | null
}

export type LifecycleHandoffContext = {
  servicem8JobUuid: string
  lead: LifecycleLeadContext | null
  quote: LifecycleQuoteContext | null
  guidance: {
    lead: LifecycleGuidanceContext
    quote: LifecycleGuidanceContext
  }
  reviewerNotes: ReviewerNote[]
  serviceM8History: ServiceM8ConversationSnapshotHistory
  fileContext: ServiceM8FileContext
  sourceMetadata: LifecycleSourceMetadata
}

export type LifecycleSourceMetadata = {
  requestedJobUuid: string
  loadedAt: string
  sources: {
    lead: PresenceSource
    quote: PresenceSource
    leadGuidance: GuidanceSource
    quoteGuidance: GuidanceSource
    reviewerNotes: CountSource
    serviceM8History: HistorySource
    files: FileSource
  }
  latestTimestamps: {
    leadUpdatedAt: string | null
    quoteUpdatedAt: string | null
    latestLeadSnapshotAt: string | null
    latestLeadSuggestionAt: string | null
    latestQuoteSnapshotAt: string | null
    latestQuoteSuggestionAt: string | null
    latestServiceM8NoteAt: string | null
    latestServiceM8EmailAt: string | null
    latestFileInterpretedAt: string | null
  }
}

export type LifecycleHandoffDeps = {
  findLeadContext: (servicem8JobUuid: string) => Promise<LifecycleLeadContext | null>
  findQuoteContext: (servicem8JobUuid: string) => Promise<LifecycleQuoteContext | null>
  findLatestLeadGuidance: (leadId: string) => Promise<LifecycleGuidanceContext>
  findLatestQuoteGuidance: (quoteId: string) => Promise<LifecycleGuidanceContext>
  findReviewerNotes: (leadId: string) => Promise<ReviewerNote[]>
  fetchHistory: (servicem8JobUuid: string) => Promise<ServiceM8ConversationSnapshotHistory>
  buildFileContext: (servicem8JobUuid: string) => Promise<ServiceM8FileContext>
  now: () => Date
}

type PresenceSource =
  | { status: 'found'; id: string }
  | { status: 'not_found' }

type GuidanceSource =
  | { status: 'found'; conversationSnapshotId: string | null; aiSuggestionId: string | null }
  | { status: 'none' }
  | { status: 'not_applicable' }

type CountSource = { status: 'found'; count: number } | { status: 'not_applicable' }

type HistorySource =
  | { status: 'complete' }
  | { status: 'partial'; safeError: string }

type FileSource = ServiceM8FileContext['sourceStatus']

export async function loadLifecycleHandoffContext(
  input: { servicem8JobUuid: string },
  deps: LifecycleHandoffDeps = realLifecycleHandoffDeps,
): Promise<LifecycleHandoffContext> {
  const servicem8JobUuid = input.servicem8JobUuid.trim()
  if (!servicem8JobUuid) {
    throw new Error('ServiceM8 job UUID is required to load lifecycle handoff context.')
  }

  const loadedAt = deps.now()
  const [lead, quote, serviceM8History, fileContext] = await Promise.all([
    deps.findLeadContext(servicem8JobUuid),
    deps.findQuoteContext(servicem8JobUuid),
    fetchSafeHistory(servicem8JobUuid, deps),
    buildSafeFileContext(servicem8JobUuid, deps),
  ])

  const [leadGuidance, quoteGuidance, reviewerNotes] = await Promise.all([
    lead ? deps.findLatestLeadGuidance(lead.id) : emptyGuidance(),
    quote ? deps.findLatestQuoteGuidance(quote.id) : emptyGuidance(),
    lead ? deps.findReviewerNotes(lead.id) : [],
  ])

  return {
    servicem8JobUuid,
    lead,
    quote,
    guidance: {
      lead: leadGuidance,
      quote: quoteGuidance,
    },
    reviewerNotes,
    serviceM8History,
    fileContext,
    sourceMetadata: buildSourceMetadata({
      servicem8JobUuid,
      loadedAt,
      lead,
      quote,
      leadGuidance,
      quoteGuidance,
      reviewerNotes,
      serviceM8History,
      fileContext,
    }),
  }
}

export const realLifecycleHandoffDeps: LifecycleHandoffDeps = {
  findLeadContext: findLeadContextForServiceM8Job,
  findQuoteContext: findQuoteContextForServiceM8Job,
  async findLatestLeadGuidance(leadId) {
    const guidance = await getLatestLeadAiGuidance(leadId)
    return {
      conversationSnapshot: guidance.conversationSnapshot,
      aiSuggestion: guidance.aiSuggestion,
    }
  },
  async findLatestQuoteGuidance(quoteId) {
    const guidance = await getLatestQuoteAiGuidance(quoteId)
    return {
      conversationSnapshot: guidance.conversationSnapshot,
      aiSuggestion: guidance.aiSuggestion,
    }
  },
  findReviewerNotes: getLeadReviewerNotes,
  fetchHistory: getJobConversationSnapshotHistory,
  buildFileContext: (servicem8JobUuid) => buildServiceM8FileContext({ servicem8JobUuid }),
  now: () => new Date(),
}

async function findLeadContextForServiceM8Job(servicem8JobUuid: string): Promise<LifecycleLeadContext | null> {
  const [row] = await db
    .select({
      id: leads.id,
      clientId: leads.clientId,
      contactId: leads.contactId,
      clientName: clients.name,
      companyName: clients.companyName,
      phone: clients.phone,
      email: clients.email,
      location: leads.location,
      channel: leads.channel,
      source: leads.source,
      product: leads.product,
      projectType: leads.projectType,
      jobDescription: leads.jobDescription,
      tier: leads.tier,
      seedScore: leads.seedScore,
      completeness: leads.completeness,
      scoreReason: leads.scoreReason,
      servicem8JobUuid: leads.servicem8JobUuid,
      servicem8JobNumber: leads.servicem8JobNumber,
      servicem8Status: leads.servicem8Status,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      clientServicem8CompanyUuid: clients.servicem8CompanyUuid,
      clientIdentityType: clients.identityType,
      clientReviewStatus: clients.reviewStatus,
      clientUpdatedAt: clients.updatedAt,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(and(eq(leads.servicem8JobUuid, servicem8JobUuid), isNull(leads.archivedAt)))
    .orderBy(desc(leads.updatedAt))
    .limit(1)

  if (!row) return null

  const contacts = await db
    .select({
      id: clientContacts.id,
      name: clientContacts.name,
      email: clientContacts.email,
      phone: clientContacts.phone,
      phoneNormalized: clientContacts.phoneNormalized,
      updatedAt: clientContacts.updatedAt,
    })
    .from(clientContacts)
    .where(eq(clientContacts.clientId, row.clientId))
    .orderBy(asc(clientContacts.createdAt))

  return {
    id: row.id,
    clientId: row.clientId,
    contactId: row.contactId,
    clientName: row.clientName,
    companyName: row.companyName,
    phone: row.phone,
    email: row.email,
    location: row.location,
    channel: row.channel,
    source: row.source,
    product: row.product,
    projectType: row.projectType,
    jobDescription: row.jobDescription,
    tier: row.tier,
    seedScore: row.seedScore,
    completeness: row.completeness,
    scoreReason: row.scoreReason,
    servicem8JobUuid: row.servicem8JobUuid,
    servicem8JobNumber: row.servicem8JobNumber,
    servicem8Status: row.servicem8Status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    client: {
      id: row.clientId,
      servicem8CompanyUuid: row.clientServicem8CompanyUuid,
      name: row.clientName,
      companyName: row.companyName,
      email: row.email,
      phone: row.phone,
      identityType: row.clientIdentityType,
      reviewStatus: row.clientReviewStatus,
      updatedAt: row.clientUpdatedAt,
    },
    contacts,
  }
}

async function findQuoteContextForServiceM8Job(servicem8JobUuid: string): Promise<LifecycleQuoteContext | null> {
  const [row] = await db
    .select({
      id: quotes.id,
      servicem8Uuid: quotes.servicem8Uuid,
      servicem8CompanyUuid: quotes.servicem8CompanyUuid,
      clientId: quotes.clientId,
      clientName: quotes.clientName,
      companyName: quotes.companyName,
      jobDescription: quotes.jobDescription,
      jobAddress: quotes.jobAddress,
      quoteValue: quotes.quoteValue,
      statusTag: currentQuoteStats().statusTag,
      aiScore: currentQuoteStats().aiScore,
      pipelineStage: quotes.pipelineStage,
      createdAt: quotes.createdAt,
      updatedAt: quotes.updatedAt,
      totalOpens: quoteEngagement.totalOpens,
      uniqueSessions: quoteEngagement.uniqueSessions,
      totalTimeMs: quoteEngagement.totalTimeMs,
      maxScrollDepth: quoteEngagement.maxScrollDepth,
      forwardingSuspected: quoteEngagement.forwardingSuspected,
      lastOpenedAt: quoteEngagement.lastOpenedAt,
    })
    .from(quotes)
    .leftJoin(quoteEngagement, eq(quoteEngagement.quoteId, quotes.id))
    .where(eq(quotes.servicem8Uuid, servicem8JobUuid))
    .orderBy(desc(quotes.updatedAt))
    .limit(1)

  if (!row) return null

  return {
    id: row.id,
    servicem8Uuid: row.servicem8Uuid,
    servicem8CompanyUuid: row.servicem8CompanyUuid,
    clientId: row.clientId,
    clientName: row.clientName,
    companyName: row.companyName,
    jobDescription: row.jobDescription,
    jobAddress: row.jobAddress,
    quoteValue: row.quoteValue,
    statusTag: row.statusTag,
    aiScore: row.aiScore,
    pipelineStage: row.pipelineStage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    engagement: row.totalOpens == null
      ? null
      : {
          totalOpens: row.totalOpens,
          uniqueSessions: row.uniqueSessions ?? 0,
          totalTimeMs: row.totalTimeMs ?? 0,
          maxScrollDepth: row.maxScrollDepth ?? 0,
          forwardingSuspected: row.forwardingSuspected ?? false,
          lastOpenedAt: row.lastOpenedAt,
        },
  }
}

function emptyGuidance(): LifecycleGuidanceContext {
  return { conversationSnapshot: null, aiSuggestion: null }
}

async function fetchSafeHistory(
  servicem8JobUuid: string,
  deps: Pick<LifecycleHandoffDeps, 'fetchHistory'>,
): Promise<ServiceM8ConversationSnapshotHistory> {
  try {
    return await deps.fetchHistory(servicem8JobUuid)
  } catch (error) {
    const safeError = safeErrorMessage(error)
    return {
      notes: [],
      emails: [],
      sourceStatus: {
        notes: { ok: false, count: 0, latestTimestamp: null, safeError },
        emails: { ok: false, count: 0, latestTimestamp: null, safeError },
      },
    }
  }
}

async function buildSafeFileContext(
  servicem8JobUuid: string,
  deps: Pick<LifecycleHandoffDeps, 'buildFileContext'>,
): Promise<ServiceM8FileContext> {
  try {
    return await deps.buildFileContext(servicem8JobUuid)
  } catch {
    return {
      servicem8JobUuid,
      files: [],
      sourceStatus: {
        status: 'partial',
        total: 0,
        interpreted: 0,
        unsupported: 0,
        failed: 1,
      },
    }
  }
}

function buildSourceMetadata(input: {
  servicem8JobUuid: string
  loadedAt: Date
  lead: LifecycleLeadContext | null
  quote: LifecycleQuoteContext | null
  leadGuidance: LifecycleGuidanceContext
  quoteGuidance: LifecycleGuidanceContext
  reviewerNotes: ReviewerNote[]
  serviceM8History: ServiceM8ConversationSnapshotHistory
  fileContext: ServiceM8FileContext
}): LifecycleSourceMetadata {
  return {
    requestedJobUuid: input.servicem8JobUuid,
    loadedAt: input.loadedAt.toISOString(),
    sources: {
      lead: input.lead ? { status: 'found', id: input.lead.id } : { status: 'not_found' },
      quote: input.quote ? { status: 'found', id: input.quote.id } : { status: 'not_found' },
      leadGuidance: guidanceSource(input.lead, input.leadGuidance),
      quoteGuidance: guidanceSource(input.quote, input.quoteGuidance),
      reviewerNotes: input.lead
        ? { status: 'found', count: input.reviewerNotes.length }
        : { status: 'not_applicable' },
      serviceM8History: historySource(input.serviceM8History),
      files: input.fileContext.sourceStatus,
    },
    latestTimestamps: {
      leadUpdatedAt: dateIso(input.lead?.updatedAt),
      quoteUpdatedAt: dateIso(input.quote?.updatedAt),
      latestLeadSnapshotAt: latestRecordTimestamp(input.leadGuidance.conversationSnapshot),
      latestLeadSuggestionAt: latestRecordTimestamp(input.leadGuidance.aiSuggestion),
      latestQuoteSnapshotAt: latestRecordTimestamp(input.quoteGuidance.conversationSnapshot),
      latestQuoteSuggestionAt: latestRecordTimestamp(input.quoteGuidance.aiSuggestion),
      latestServiceM8NoteAt: input.serviceM8History.sourceStatus.notes.latestTimestamp,
      latestServiceM8EmailAt: input.serviceM8History.sourceStatus.emails.latestTimestamp,
      latestFileInterpretedAt: latestFileTimestamp(input.fileContext),
    },
  }
}

function guidanceSource(
  owningContext: LifecycleLeadContext | LifecycleQuoteContext | null,
  guidance: LifecycleGuidanceContext,
): GuidanceSource {
  if (!owningContext) return { status: 'not_applicable' }
  if (!guidance.conversationSnapshot && !guidance.aiSuggestion) return { status: 'none' }
  return {
    status: 'found',
    conversationSnapshotId: guidance.conversationSnapshot?.id ?? null,
    aiSuggestionId: guidance.aiSuggestion?.id ?? null,
  }
}

function historySource(history: ServiceM8ConversationSnapshotHistory): HistorySource {
  const safeError = [
    history.sourceStatus.notes.safeError,
    history.sourceStatus.emails.safeError,
  ].filter((value): value is string => Boolean(value)).join(' ')
  if (history.sourceStatus.notes.ok && history.sourceStatus.emails.ok) return { status: 'complete' }
  return { status: 'partial', safeError: safeError || 'ServiceM8 history is partial.' }
}

function latestRecordTimestamp(record: LifecycleGuidanceRecord | null): string | null {
  return dateIso(record?.capturedAt) ?? dateIso(record?.createdAt)
}

function latestFileTimestamp(fileContext: ServiceM8FileContext): string | null {
  const timestamps = fileContext.files
    .map((file) => file.interpretedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())
  return dateIso(timestamps[0])
}

function dateIso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 300)
  return 'Lifecycle handoff source could not be loaded.'
}
