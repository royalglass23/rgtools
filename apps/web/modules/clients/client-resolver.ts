import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { quotes } from '@rgtools/db/schema'
import { workOrders } from '@rgtools/db/schema-workorders'
import { clientAliases, clientMergedReferences, clients, clientContacts, leads } from '@rgtools/db/schema-leads'
import { buildClientIdentityUpsert } from './client-identity'
import { collectClientAliases } from './client-aliases'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type ResolveClientInput = {
  /** Canonical ServiceM8 company identity. When present, the client is "linked". */
  servicem8CompanyUuid?: string | null
  clientName: string
  companyName?: string | null
  phone?: string | null
  phoneNormalized?: string | null
  email?: string | null
  servicem8SourceSnapshot?: unknown
  servicem8SyncedAt?: Date
  /** Force a separate review record after a concurrent identity collision. */
  forceContactReview?: boolean
}

export type ResolveClientResult = {
  clientId: string
  contactId: string | null
  matchedExistingClient: boolean
  linked: boolean
  contactReviewReason?: string
}

export type ContactIdentityMatch = {
  kind: 'email' | 'phone'
  clientId: string
  clientName: string
}

export async function resolveClient(tx: Tx, input: ResolveClientInput): Promise<ResolveClientResult> {
  const now = new Date()
  const companyUuid = input.servicem8CompanyUuid?.trim() || null

  if (companyUuid) {
    const [existing] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.servicem8CompanyUuid, companyUuid), eq(clients.isMerged, false)))
      .limit(1)
    if (!existing) {
      const mergedMatch = await findMergedReferenceMatch(tx, companyUuid, null, null)
      if (mergedMatch) {
        const contactId = await resolveContact(tx, mergedMatch.survivorClientId, input)
        return { clientId: mergedMatch.survivorClientId, contactId, matchedExistingClient: true, linked: true }
      }
    }
    const identityUpdate = buildClientIdentityUpsert({
      existing: existing ? {
        name: existing.name,
        companyName: existing.companyName,
        phone: existing.phone,
        phoneNormalized: existing.phoneNormalized,
        email: existing.email,
        reviewStatus: existing.reviewStatus,
        canonicalSource: existing.canonicalSource,
        canonicalUpdatedAt: existing.canonicalUpdatedAt,
      } : null,
      source: {
        servicem8CompanyUuid: companyUuid,
        clientName: input.clientName,
        companyName: input.companyName || null,
        phone: input.phone || null,
        phoneNormalized: input.phoneNormalized || null,
        email: input.email || null,
        sourceSnapshot: input.servicem8SourceSnapshot ?? null,
        syncedAt: input.servicem8SyncedAt ?? now,
      },
      now,
    })

    const [row] = existing
      ? await tx
        .update(clients)
        .set(identityUpdate)
        .where(eq(clients.id, existing.id))
        .returning({ id: clients.id })
      : await tx
        .insert(clients)
        .values(identityUpdate)
      .returning({ id: clients.id })

    const contactId = await resolveContact(tx, row.id, input)
    return { clientId: row.id, contactId, matchedExistingClient: true, linked: true }
  }

  // Without a canonical ServiceM8 identity, check whether the supplied email
  // and phone point to different active clients before reusing a provisional
  // record. A linked client can still own one of the supplied details.
  if (input.phoneNormalized && input.email) {
    const matches = await findContactIdentityMatches(tx, {
      email: input.email,
      phoneNormalized: input.phoneNormalized,
    })
    const distinctClientIds = new Set(matches.map((match) => match.clientId))
    if (distinctClientIds.size > 1 || input.forceContactReview) {
      if (matches.length === 0) throw new Error('Contact conflict owner could not be resolved.')
      return createContactReviewClient(tx, input, buildContactReviewReason(matches))
    }
  }

  const matched = await findProvisionalMatch(tx, input.phoneNormalized || null, input.email || null)
  if (matched) {
    await tx
      .update(clients)
      .set({
        name: input.clientName,
        companyName: input.companyName || matched.companyName,
        phone: input.phone || matched.phone,
        phoneNormalized: input.phoneNormalized || matched.phoneNormalized,
        email: input.email || matched.email,
        updatedAt: now,
      })
      .where(eq(clients.id, matched.id))
    const contactId = await resolveContact(tx, matched.id, input)
    return { clientId: matched.id, contactId, matchedExistingClient: true, linked: false }
  }
  const mergedMatch = await findMergedReferenceMatch(tx, null, input.phoneNormalized || null, input.email || null)
  if (mergedMatch) {
    const contactId = await resolveContact(tx, mergedMatch.survivorClientId, input)
    return { clientId: mergedMatch.survivorClientId, contactId, matchedExistingClient: true, linked: false }
  }

  const [created] = await tx
    .insert(clients)
    .values({
      name: input.clientName,
      companyName: input.companyName || null,
      phone: input.phone || null,
      phoneNormalized: input.phoneNormalized || null,
      email: input.email || null,
    })
    .returning({ id: clients.id })

  const contactId = await resolveContact(tx, created.id, input)
  return { clientId: created.id, contactId, matchedExistingClient: false, linked: false }
}

export async function getContactIdentityMatches({
  email,
  phoneNormalized,
  excludeClientId,
}: {
  email: string | null
  phoneNormalized: string | null
  excludeClientId?: string
}): Promise<ContactIdentityMatch[]> {
  return db.transaction((tx) => findContactIdentityMatches(tx, { email, phoneNormalized, excludeClientId }))
}

async function findContactIdentityMatches(
  tx: Tx,
  {
    email,
    phoneNormalized,
    excludeClientId,
  }: { email: string | null; phoneNormalized: string | null; excludeClientId?: string },
): Promise<ContactIdentityMatch[]> {
  const matches: ContactIdentityMatch[] = []

  if (email) {
    matches.push(...await findIdentityOwners(tx, 'email', email))
  }
  if (phoneNormalized) {
    matches.push(...await findIdentityOwners(tx, 'phone', phoneNormalized))
  }

  const unique = new Map<string, ContactIdentityMatch>()
  for (const match of matches) {
    if (match.clientId !== excludeClientId) unique.set(`${match.kind}:${match.clientId}`, match)
  }
  return [...unique.values()]
}

async function findIdentityOwners(
  tx: Tx,
  kind: 'email' | 'phone',
  value: string,
): Promise<ContactIdentityMatch[]> {
  const clientColumn = kind === 'email' ? clients.email : clients.phoneNormalized
  const contactColumn = kind === 'email' ? clientContacts.email : clientContacts.phoneNormalized
  const mergedColumn = kind === 'email' ? clientMergedReferences.email : clientMergedReferences.phoneNormalized

  const direct = await tx
    .select({ clientId: clients.id, clientName: clients.name })
    .from(clients)
    .where(and(eq(clients.isMerged, false), eq(clientColumn, value)))

  const contacts = await tx
    .select({ clientId: clients.id, clientName: clients.name })
    .from(clientContacts)
    .innerJoin(clients, eq(clientContacts.clientId, clients.id))
    .where(and(eq(clients.isMerged, false), eq(contactColumn, value)))

  const merged = await tx
    .select({ clientId: clients.id, clientName: clients.name })
    .from(clientMergedReferences)
    .innerJoin(clients, eq(clientMergedReferences.survivorClientId, clients.id))
    .where(and(eq(clients.isMerged, false), eq(mergedColumn, value)))

  return [...direct, ...contacts, ...merged].map((row) => ({ kind, ...row }))
}

function buildContactReviewReason(matches: ContactIdentityMatch[]): string {
  const emailNames = uniqueNames(matches, 'email')
  const phoneNames = uniqueNames(matches, 'phone')
  const ownership = [
    emailNames.length ? `the email matches ${emailNames.join(', ')}` : null,
    phoneNames.length ? `the phone matches ${phoneNames.join(', ')}` : null,
  ].filter((part): part is string => Boolean(part)).join(', while ')

  return `Contact details need checking: ${ownership}. Verify the submitted details before linking or merging.`
}

function uniqueNames(matches: ContactIdentityMatch[], kind: ContactIdentityMatch['kind']): string[] {
  return [...new Set(matches.filter((match) => match.kind === kind).map((match) => match.clientName))]
}

async function createContactReviewClient(
  tx: Tx,
  input: ResolveClientInput,
  reason: string,
): Promise<ResolveClientResult> {
  const [created] = await tx
    .insert(clients)
    .values({
      name: input.clientName,
      companyName: input.companyName || null,
      phone: input.phone || null,
      // Keep the supplied number for staff and ServiceM8 without claiming the
      // phone identity already owned by another provisional client.
      phoneNormalized: null,
      email: input.email || null,
      reviewStatus: 'pending_review',
      reviewNote: reason,
    })
    .returning({ id: clients.id })

  const contactId = await resolveContact(tx, created.id, input)
  return {
    clientId: created.id,
    contactId,
    matchedExistingClient: false,
    linked: false,
    contactReviewReason: reason,
  }
}

/**
 * Resolve the contact (person) for a client, deduped WITHIN that company by
 * normalized phone or email. Scoping to the company is what makes "same email
 * = same contact" safe even when two companies share a generic info@ address.
 * Returns null when there is no phone/email and no name to anchor a contact.
 */
async function resolveContact(tx: Tx, clientId: string, input: ResolveClientInput): Promise<string | null> {
  const phoneNormalized = input.phoneNormalized || null
  const email = input.email || null
  const name = input.clientName?.trim() || null
  if (!phoneNormalized && !email && !name) return null

  const now = new Date()
  const matchers: SQL[] = []
  if (phoneNormalized) matchers.push(eq(clientContacts.phoneNormalized, phoneNormalized))
  if (email) matchers.push(eq(clientContacts.email, email))

  if (matchers.length > 0) {
    const [existing] = await tx
      .select({ id: clientContacts.id })
      .from(clientContacts)
      .where(and(eq(clientContacts.clientId, clientId), matchers.length === 1 ? matchers[0] : or(...matchers)))
      .limit(1)
    if (existing) {
      await tx
        .update(clientContacts)
        .set({ name, phone: input.phone || null, phoneNormalized, email, updatedAt: now })
        .where(eq(clientContacts.id, existing.id))
      return existing.id
    }
  }

  const [created] = await tx
    .insert(clientContacts)
    .values({ clientId, name, phone: input.phone || null, phoneNormalized, email })
    .returning({ id: clientContacts.id })
  return created.id
}

async function findProvisionalMatch(tx: Tx, phoneNormalized: string | null, email: string | null) {
  const matchers: SQL[] = []
  if (phoneNormalized) matchers.push(eq(clients.phoneNormalized, phoneNormalized))
  if (email) matchers.push(eq(clients.email, email))
  if (matchers.length === 0) return null

  const [row] = await tx
    .select()
    .from(clients)
    .where(and(eq(clients.isMerged, false), isNull(clients.servicem8CompanyUuid), matchers.length === 1 ? matchers[0] : or(...matchers)))
    .limit(1)

  return row ?? null
}

async function findMergedReferenceMatch(
  tx: Tx,
  servicem8CompanyUuid: string | null,
  phoneNormalized: string | null,
  email: string | null,
) {
  const matchers: SQL[] = []
  if (servicem8CompanyUuid) matchers.push(eq(clientMergedReferences.servicem8CompanyUuid, servicem8CompanyUuid))
  if (phoneNormalized) matchers.push(eq(clientMergedReferences.phoneNormalized, phoneNormalized))
  if (email) matchers.push(eq(clientMergedReferences.email, email))
  if (matchers.length === 0) return null

  const [row] = await tx
    .select({ survivorClientId: clientMergedReferences.survivorClientId })
    .from(clientMergedReferences)
    .where(matchers.length === 1 ? matchers[0] : or(...matchers))
    .limit(1)

  return row ?? null
}

/**
 * Absorb `loserIds` into `survivorId`: re-point every project and contact onto
 * the survivor, then delete the losers. Transactional — the caller owns the tx.
 */
export async function mergeClients(tx: Tx, survivorId: string, loserIds: string[]): Promise<void> {
  const losers = loserIds.filter((id) => id && id !== survivorId)
  if (losers.length === 0) return
  const now = new Date()

  // Move people to the survivor BEFORE deleting losers — the FK cascade would
  // otherwise drop their contacts.
  const loserRows = await tx
    .select({
      id: clients.id,
      name: clients.name,
      companyName: clients.companyName,
      notes: clients.notes,
      email: clients.email,
      phoneNormalized: clients.phoneNormalized,
      servicem8CompanyUuid: clients.servicem8CompanyUuid,
      servicem8Name: clients.servicem8Name,
      servicem8CompanyName: clients.servicem8CompanyName,
    })
    .from(clients)
    .where(inArray(clients.id, losers))
  const aliases = collectClientAliases(loserRows.flatMap((row) => [
    row.name,
    row.companyName,
    row.servicem8Name,
    row.servicem8CompanyName,
  ]))
  const [survivor] = await tx
    .select({ notes: clients.notes })
    .from(clients)
    .where(eq(clients.id, survivorId))
    .limit(1)
  const loserAliasRows = await tx
    .select({ alias: clientAliases.alias, source: clientAliases.source })
    .from(clientAliases)
    .where(inArray(clientAliases.clientId, losers))
  const mergedNotes = collectClientAliases(loserRows.map((row) => row.notes))
  if (aliases.length > 0) {
    await tx
      .insert(clientAliases)
      .values(aliases.map((alias) => ({ clientId: survivorId, alias, source: 'merge' as const })))
      .onConflictDoNothing()
  }
  if (loserRows.length > 0) {
    await tx
      .insert(clientMergedReferences)
      .values(loserRows.map((row) => ({
        survivorClientId: survivorId,
        mergedClientId: row.id,
        servicem8CompanyUuid: row.servicem8CompanyUuid,
        name: row.name,
        companyName: row.companyName,
        email: row.email,
        phoneNormalized: row.phoneNormalized,
        mergedAt: now,
      })))
      .onConflictDoNothing()
  }

  await tx.update(clientContacts).set({ clientId: survivorId, updatedAt: now }).where(inArray(clientContacts.clientId, losers))
  if (loserAliasRows.length > 0) {
    await tx
      .insert(clientAliases)
      .values(loserAliasRows.map((row) => ({ clientId: survivorId, alias: row.alias, source: row.source })))
      .onConflictDoNothing()
    await tx.delete(clientAliases).where(inArray(clientAliases.clientId, losers))
  }
  await tx.update(leads).set({ clientId: survivorId, updatedAt: now }).where(inArray(leads.clientId, losers))
  await tx.update(quotes).set({ clientId: survivorId, updatedAt: now }).where(inArray(quotes.clientId, losers))
  await tx.update(workOrders).set({ clientId: survivorId, updatedAt: now }).where(inArray(workOrders.clientId, losers))
  if (mergedNotes.length > 0) {
    await tx
      .update(clients)
      .set({
        notes: [survivor?.notes, ...mergedNotes].filter(Boolean).join('\n\n'),
        updatedAt: now,
      })
      .where(eq(clients.id, survivorId))
  }
  await tx
    .update(clients)
    .set({ isMerged: true, mergedIntoClientId: survivorId, mergedAt: now, updatedAt: now })
    .where(inArray(clients.id, losers))
}
