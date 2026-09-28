'use server'

import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { userCanAccessSlug } from '@/lib/access-db'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit-db'
import { clients, leads } from '@rgtools/db/schema-leads'
import { resolveClient } from '@/modules/clients/client-resolver'
import { getActiveScoringOptionLists } from '@/modules/lead-intake/scoring/config-options'
import { DECISION_MATRIX, type MatrixFieldKey } from '@/modules/lead-intake/scoring/score-lead'
import { persistLeadScore } from '@/modules/lead-intake/scoring/persist-score'
import {
  markLeadPendingServiceM8Sync,
  syncLeadToServiceM8,
  type ServiceM8LeadSyncOutcome,
} from '@/modules/lead-intake/servicem8/sync'
import {
  normalizeInput,
  repairMatrixFieldAliases,
  validateMinimum,
  validateScoredOptions,
} from './intake-utils'
import { computeDrivingDistance } from './distance'

type LeadInsert = typeof leads.$inferInsert

export type LeadIntakeInput = {
  leadId?: string
  editReason?: string
  clientName: string
  companyName?: string
  phone?: string
  email?: string
  /** ServiceM8 company UUID when known (import enrichment) — makes the client "linked". */
  servicem8CompanyUuid?: string
  clientProfileKey: string
  projectType: string
  product?: string
  location: string
  suburb?: string
  cat4?: string
  consentStatus?: string
  rcStatus?: string
  bcStatus?: string
  buildingStage?: string
  followUpDate?: string
  lastUpdated?: string
  budgetBand?: string
  decisionMakers?: string
  priceSensitivityRead?: string
  distanceBand?: string
  rawDrivingDistanceKm?: number | null
  leadSource?: string
  paymentHistory?: string
  siteAccess?: string
  installationHeight?: string
  jobDescription?: string
  source: 'phone' | 'email' | 'wechat' | 'calculator' | 'contact_form' | 'other'
  timeline?: string
  externalRef?: string
  freeText?: string
}

export type LeadIntakeResult =
  | {
      success: true
      leadId: string
      clientId: string
      matchedExistingClient: boolean
      score: number
      tier: 'A' | 'B' | 'C' | 'D' | 'E'
      reason: string
      completeness: number
      distanceBand: string | null
      flagNote: string | null
      servicem8Sync: ServiceM8LeadSyncOutcome
      contactReviewReason?: string | null
    }
  | { error: string }

export async function getLeadIntakeForEdit(leadId: string): Promise<LeadIntakeInput | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const allowed = await userCanAccessSlug(session.user.id, 'lead-intake')
  if (!allowed) return null

  const [row] = await db
    .select({
      leadId: leads.id,
      channel: leads.channel,
      clientTypeAnswer: leads.clientTypeAnswer,
      source: leads.source,
      projectType: leads.projectType,
      product: leads.product,
      location: leads.location,
      suburb: leads.suburb,
      resourceConsent: leads.resourceConsent,
      buildingConsent: leads.buildingConsent,
      buildingStage: leads.buildingStage,
      followUpDate: leads.followUpDate,
      budgetBand: leads.budgetBand,
      decisionMakers: leads.decisionMakers,
      priceSensitivity: leads.priceSensitivity,
      distanceBand: leads.distanceBand,
      rawDrivingDistanceKm: leads.rawDrivingDistanceKm,
      paymentHistory: leads.paymentHistory,
      siteAccess: leads.siteAccess,
      installationHeight: leads.installationHeight,
      jobDescription: leads.jobDescription,
      freeText: leads.freeText,
      updatedAt: leads.updatedAt,
      clientName: clients.name,
      companyName: clients.companyName,
      phone: clients.phone,
      email: clients.email,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(eq(leads.id, leadId))
    .limit(1)

  if (!row) return null

  return {
    leadId: row.leadId,
    clientName: row.clientName,
    companyName: row.companyName ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    clientProfileKey: row.clientTypeAnswer ?? '',
    projectType: row.product ?? row.projectType ?? '',
    location: row.location ?? '',
    suburb: row.suburb ?? '',
    cat4: row.projectType ?? '',
    distanceBand: row.distanceBand ?? '',
    consentStatus: '',
    rcStatus: row.resourceConsent ?? '',
    bcStatus: row.buildingConsent ?? '',
    buildingStage: row.buildingStage ?? '',
    followUpDate: row.followUpDate ?? '',
    lastUpdated: row.updatedAt.toISOString(),
    budgetBand: row.budgetBand ?? '',
    decisionMakers: row.decisionMakers ?? '',
    priceSensitivityRead: row.priceSensitivity ?? '',
    source: row.channel,
    leadSource: row.source ?? '',
    paymentHistory: row.paymentHistory ?? '',
    siteAccess: row.siteAccess ?? '',
    installationHeight: row.installationHeight ?? '',
    rawDrivingDistanceKm: row.rawDrivingDistanceKm === null ? null : Number(row.rawDrivingDistanceKm),
    jobDescription: row.jobDescription ?? '',
    freeText: row.freeText ?? '',
  }
}

export async function computeLeadDistance(address: string): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return (await computeDrivingDistance(address))?.band ?? null
}

export async function submitLeadIntake(input: LeadIntakeInput): Promise<LeadIntakeResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Forbidden' }

  return submitLeadIntakeForUser(input, session.user.id)
}

export async function submitLeadIntakeForUser(
  input: LeadIntakeInput,
  actorId: string | null,
  {
    syncServiceM8 = true,
    allowMissingContact = false,
    forceContactReview = false,
  }: { syncServiceM8?: boolean; allowMissingContact?: boolean; forceContactReview?: boolean } = {},
): Promise<LeadIntakeResult> {
  const normalized = repairMatrixFieldAliases(normalizeInput(input))
  const validationError = allowMissingContact
    ? validateMinimumWithoutContact(normalized)
    : validateMinimum(normalized)
  if (validationError) return { error: validationError }
  if (normalized.leadId && !normalized.editReason) return { error: 'Reason for edit is required.' }

  const optionLists = await getActiveScoringOptionLists()
  const optionError = validateScoredOptions(normalized, optionLists.categories)
  if (optionError) return { error: optionError }

  const distance = await computeDrivingDistance(normalized.location)
  const distanceBand = distance?.band ?? normalized.distanceBand ?? null
  const rawDrivingDistanceKm = distance?.rawKm ?? normalized.rawDrivingDistanceKm ?? null
  const matrixFields = buildMatrixFields(normalized, distanceBand)
  const followUpDate = parseFollowUpDate(normalized.followUpDate)
  const now = new Date()
  let leadId = ''
  let clientId = ''
  let contactId: string | null = null
  let matchedExistingClient = Boolean(normalized.leadId)
  let contactReviewReason: string | null = null

  await db.transaction(async (tx) => {
    if (normalized.leadId) {
      const [existingLead] = await tx
        .select({ id: leads.id, clientId: leads.clientId })
        .from(leads)
        .where(eq(leads.id, normalized.leadId))
        .limit(1)

      if (!existingLead) throw new Error(`Lead not found: ${normalized.leadId}`)

      leadId = existingLead.id
      clientId = existingLead.clientId

      await tx
        .update(clients)
        .set({
          name: normalized.clientName,
          companyName: normalized.companyName || null,
          phone: normalized.phone || null,
          phoneNormalized: normalized.phoneNormalized,
          email: normalized.email || null,
          updatedAt: now,
        })
        .where(eq(clients.id, clientId))

      await tx
        .update(leads)
        .set({
          channel: normalized.source,
          clientTypeAnswer: matrixFields.clientTypeAnswer,
          budgetBand: matrixFields.budgetBand,
          resourceConsent: matrixFields.resourceConsent,
          buildingConsent: matrixFields.buildingConsent,
          buildingStage: matrixFields.buildingStage,
          projectType: matrixFields.projectType,
          product: normalized.projectType || null,
          priceSensitivity: matrixFields.priceSensitivity,
          decisionMakers: matrixFields.decisionMakers,
          distanceBand: matrixFields.distanceBand,
          rawDrivingDistanceKm: rawDrivingDistanceKm === null ? null : String(rawDrivingDistanceKm),
          source: matrixFields.source,
          paymentHistory: matrixFields.paymentHistory,
          siteAccess: matrixFields.siteAccess,
          installationHeight: matrixFields.installationHeight,
          jobDescription: normalized.jobDescription || null,
          location: normalized.location,
          suburb: normalized.suburb || null,
          timeline: normalized.timeline || null,
          consentStatus: null,
          followUpDate,
          freeText: normalized.freeText || null,
          updatedAt: now,
        })
        .where(eq(leads.id, leadId))
    } else {
      const resolved = await resolveClient(tx, {
        servicem8CompanyUuid: normalized.servicem8CompanyUuid,
        clientName: normalized.clientName,
        companyName: normalized.companyName,
        phone: normalized.phone,
        phoneNormalized: normalized.phoneNormalized,
        email: normalized.email,
        forceContactReview,
      })
      clientId = resolved.clientId
      contactId = resolved.contactId
      matchedExistingClient = resolved.matchedExistingClient
      contactReviewReason = resolved.contactReviewReason ?? null

      const [createdLead] = await tx
        .insert(leads)
        .values({
          clientId,
          contactId,
          channel: normalized.source,
          syncStatus: 'pending_sync',
          clientTypeAnswer: matrixFields.clientTypeAnswer,
          budgetBand: matrixFields.budgetBand,
          resourceConsent: matrixFields.resourceConsent,
          buildingConsent: matrixFields.buildingConsent,
          buildingStage: matrixFields.buildingStage,
          projectType: matrixFields.projectType,
          product: normalized.projectType || null,
          priceSensitivity: matrixFields.priceSensitivity,
          decisionMakers: matrixFields.decisionMakers,
          distanceBand: matrixFields.distanceBand,
          rawDrivingDistanceKm: rawDrivingDistanceKm === null ? null : String(rawDrivingDistanceKm),
          source: matrixFields.source,
          paymentHistory: matrixFields.paymentHistory,
          siteAccess: matrixFields.siteAccess,
          installationHeight: matrixFields.installationHeight,
          jobDescription: normalized.jobDescription || null,
          location: normalized.location,
          suburb: normalized.suburb || null,
          timeline: normalized.timeline || null,
          externalRef: normalized.externalRef || null,
          consentStatus: null,
          followUpDate,
          freeText: normalized.freeText || null,
          createdBy: actorId,
        })
        .returning({ id: leads.id })

      leadId = createdLead.id
    }

    await logAudit({
      actorId,
      entityType: 'lead',
      action: normalized.leadId ? 'lead.edited' : 'lead.create',
      targetId: leadId,
      before: normalized.leadId
        ? {
            clientId,
            channel: null,
            matchedExistingClient,
            reason: null,
          }
        : null,
      after: {
        clientId,
        channel: normalized.source,
        matchedExistingClient,
        ...(normalized.leadId ? { reason: normalized.editReason } : {}),
      },
    }, tx)
  })

  const score = await persistLeadScore(leadId, actorId)
  await markLeadPendingServiceM8Sync(leadId)
  const servicem8Sync = syncServiceM8
    ? await syncLeadToServiceM8(leadId)
    : { ok: true as const, leadId, reference: 'pending_retry' }

  return {
    success: true,
    leadId,
    clientId,
    matchedExistingClient,
    score: score.score,
    tier: score.tier,
    reason: score.reason,
    completeness: score.completenessPercent,
    distanceBand,
    flagNote: score.flagNote,
    servicem8Sync,
    contactReviewReason,
  }
}

function buildMatrixFields(normalized: ReturnType<typeof normalizeInput>, distanceBand: string | null) {
  return {
    clientTypeAnswer: enumOptionOrNull('clientType', normalized.clientProfileKey) as LeadInsert['clientTypeAnswer'],
    budgetBand: enumOptionOrNull('budgetBand', normalized.budgetBand) as LeadInsert['budgetBand'],
    resourceConsent: enumOptionOrNull('resourceConsent', normalized.rcStatus) as LeadInsert['resourceConsent'],
    buildingConsent: enumOptionOrNull('buildingConsent', normalized.bcStatus) as LeadInsert['buildingConsent'],
    buildingStage: enumOptionOrNull('buildingStage', normalized.buildingStage) as LeadInsert['buildingStage'],
    projectType: enumOptionOrNull('projectType', normalized.cat4) as LeadInsert['projectType'],
    priceSensitivity: enumOptionOrNull('priceSensitivity', normalized.priceSensitivityRead) as LeadInsert['priceSensitivity'],
    decisionMakers: enumOptionOrNull('decisionMakers', normalized.decisionMakers) as LeadInsert['decisionMakers'],
    distanceBand: enumOptionOrNull('distanceBand', distanceBand) as LeadInsert['distanceBand'],
    source: enumOptionOrNull('source', normalized.leadSource) as LeadInsert['source'],
    paymentHistory: enumOptionOrNull('paymentHistory', normalized.paymentHistory) as LeadInsert['paymentHistory'],
    siteAccess: enumOptionOrNull('siteAccess', normalized.siteAccess) as LeadInsert['siteAccess'],
    installationHeight: enumOptionOrNull('installationHeight', normalized.installationHeight) as LeadInsert['installationHeight'],
  }
}

function enumOptionOrNull(fieldKey: MatrixFieldKey, value: string | null | undefined): string | null {
  if (!value) return null
  return DECISION_MATRIX.fields
    .find((field) => field.key === fieldKey)
    ?.options.some((option) => option.key === value)
    ? value
    : null
}

function validateMinimumWithoutContact(input: ReturnType<typeof normalizeInput>): string | null {
  if (!input.clientName) return 'Client name is required.'
  if (!input.location) return 'Job address is required.'
  return null
}

function parseFollowUpDate(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const date = new Date(`${trimmed}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}
