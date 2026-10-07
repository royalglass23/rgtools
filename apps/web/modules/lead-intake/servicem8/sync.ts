import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auditLog } from '@rgtools/db/schema'
import { logAudit } from '@/lib/audit-db'
import { clients, leads } from '@rgtools/db/schema-leads'
import { errorMessage } from '@/lib/error-message'
import { setJobLeadCardFields, upsertJobDiaryNote } from '@/lib/servicem8/client'
import { createServiceM8ClientFromEnv } from './client'
import {
  buildServiceM8InboxEmail,
  buildServiceM8LeadJobCardFields,
  type ServiceM8LeadSyncRecord,
} from './payload'

export type ServiceM8LeadSyncOutcome =
  | { ok: true; leadId: string; reference: string }
  | { ok: false; leadId: string; error: string }

export type ServiceM8BatchSyncOutcome = {
  total: number
  results: ServiceM8LeadSyncOutcome[]
}

export async function syncLeadToServiceM8(leadId: string): Promise<ServiceM8LeadSyncOutcome> {
  try {
    const record = await loadLeadSyncRecord(leadId)
    if (record.servicem8JobUuid) {
      const reference = `linked:${record.servicem8JobUuid}`
      const now = new Date()

      // Already-linked leads skip the inbox email, but still receive the current
      // Job Description and any available custom fields. Best-effort: a failed
      // write must not fail the sync because the lead is already linked.
      try {
        const fields = buildServiceM8LeadJobCardFields(record)
        await setJobLeadCardFields(record.servicem8JobUuid, fields)
        if (fields.diaryNote) {
          await upsertJobDiaryNote(
            record.servicem8JobUuid,
            fields.diaryNote,
            `RGTools Lead: ${record.leadId}`,
          )
        }
        if (fields.summaryNote) {
          await upsertJobDiaryNote(
            record.servicem8JobUuid,
            fields.summaryNote,
            `Reference: RGTools Lead ${record.leadId}`,
          )
        }
      } catch {
        // swallow — job-card fields are best-effort; the sync still succeeds
      }

      await db
        .update(leads)
        .set({
          servicem8JobUuid: record.servicem8JobUuid,
          syncStatus: 'synced',
          syncError: null,
          updatedAt: now,
        })
        .where(eq(leads.id, leadId))

      await logAudit({
        actorId: null,
        entityType: 'lead',
        action: 'lead.servicem8_sync',
        targetId: leadId,
        before: null,
        after: {
          reference,
          skipped: true,
          reason: 'already_linked',
        },
      })

      return { ok: true, leadId, reference }
    }

    const client = createServiceM8ClientFromEnv()
    const noteSignature = buildServiceM8InboxEmail(record, []).noteSignature
    const lastSignature = await loadLastSyncedNoteSignature(leadId)
    const shouldCreateNote = lastSignature !== noteSignature
    const syncResult = await client.sendLeadToInbox(record, { createNote: shouldCreateNote })
    const now = new Date()

    await db
      .update(leads)
      .set({
        servicem8JobUuid: record.servicem8JobUuid,
        syncStatus: 'synced',
        syncError: null,
        updatedAt: now,
      })
      .where(eq(leads.id, leadId))

    await logAudit({
      actorId: null,
      entityType: 'lead',
      action: 'lead.servicem8_sync',
      targetId: leadId,
      before: null,
      after: {
        reference: syncResult.reference,
        sentToInbox: shouldCreateNote,
        noteSignature: syncResult.noteSignature,
      },
    })

    return { ok: true, leadId, reference: syncResult.reference }
  } catch (error) {
    const message = errorMessage(error)

    await db
      .update(leads)
      .set({
        syncStatus: 'sync_failed',
        syncError: message,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId))

    await logAudit({
      actorId: null,
      entityType: 'lead',
      action: 'lead.servicem8_sync_failed',
      targetId: leadId,
      before: null,
      after: { error: message },
    })

    return { ok: false, leadId, error: message }
  }
}

export async function retryServiceM8LeadSyncBatch(
  { limit = 10 }: { limit?: number } = {},
): Promise<ServiceM8BatchSyncOutcome> {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 25)
  const rows = await db
    .select({ leadId: leads.id })
    .from(leads)
    .where(or(eq(leads.syncStatus, 'pending_sync'), eq(leads.syncStatus, 'sync_failed')))
    .limit(boundedLimit)

  const results: ServiceM8LeadSyncOutcome[] = []
  for (const row of rows) {
    results.push(await syncLeadToServiceM8(row.leadId))
  }

  return {
    total: rows.length,
    results,
  }
}

export async function markLeadPendingServiceM8Sync(leadId: string): Promise<void> {
  await db
    .update(leads)
    .set({
      syncStatus: 'pending_sync',
      syncError: null,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId))
}

async function loadLeadSyncRecord(leadId: string): Promise<ServiceM8LeadSyncRecord> {
  const [record] = await db
    .select({
      leadId: leads.id,
      servicem8JobUuid: leads.servicem8JobUuid,
      clientName: clients.name,
      companyName: clients.companyName,
      phone: clients.phone,
      email: clients.email,
      channel: leads.channel,
      source: leads.source,
      projectType: leads.product,
      location: leads.location,
      suburb: leads.suburb,
      budgetBand: leads.budgetBand,
      consentStatus: leads.consentStatus,
      priceSensitivityRead: leads.priceSensitivity,
      decisionMakers: leads.decisionMakers,
      freeText: leads.jobDescription,
      seedScore: leads.seedScore,
      tier: leads.tier,
      scoreReason: leads.scoreReason,
      strikeFlag: leads.strikeFlag,
      completeness: leads.completeness,
      clientProfileKey: leads.clientTypeAnswer,
      complexity: leads.projectType,
      distanceBand: leads.distanceBand,
      paymentHistory: leads.paymentHistory,
      siteAccess: leads.siteAccess,
      installationHeight: leads.installationHeight,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(eq(leads.id, leadId))
    .limit(1)

  if (!record) {
    throw new Error(`Lead not found: ${leadId}`)
  }

  return {
    ...record,
  }
}

async function loadLastSyncedNoteSignature(leadId: string): Promise<string | null> {
  const [row] = await db
    .select({ detail: auditLog.detail })
    .from(auditLog)
    .where(and(
      eq(auditLog.targetId, leadId),
      inArray(auditLog.action, ['lead.servicem8_sync']),
    ))
    .orderBy(desc(auditLog.createdAt))
    .limit(1)

  const detail = row?.detail
  if (!detail || typeof detail !== 'object' || !('noteSignature' in detail)) return null

  const signature = 'noteSignature' in detail && typeof detail.noteSignature === 'object' && detail.noteSignature !== null && 'to' in detail.noteSignature
    ? (detail.noteSignature as { to?: unknown }).to
    : detail.noteSignature
  return typeof signature === 'string' ? signature : null
}
