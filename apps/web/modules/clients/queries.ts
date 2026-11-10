import { currentQuoteStats } from '@/modules/quote-tracker/current-stats'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { quotes } from '@rgtools/db/schema'
import { clientAliases, clientContacts, clients, leads } from '@rgtools/db/schema-leads'
import { workOrders } from '@rgtools/db/schema-workorders'
import { db } from '@/lib/db'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ClientShapeBase = {
  id: string
  name: string
  companyName: string | null
  email: string | null
  phone: string | null
  servicem8CompanyUuid: string | null
  canonicalSource: 'import' | 'manual' | 'system'
  reviewStatus: 'pending_review' | 'reviewed' | 'dismissed'
  identityType: string | null
  createdAt: Date
  updatedAt: Date
}

type ClientListShapeInput = ClientShapeBase & {
  aliases: Array<{ alias: string }>
  contacts: Array<{ id: string; updatedAt: Date }>
  leads: Array<{ id: string; updatedAt: Date }>
  quotes: Array<{ id: string; updatedAt: Date }>
  workOrders?: Array<{ id: string; updatedAt: Date }>
}

export type ClientListRow = {
  id: string
  companyName: string
  servicem8CompanyUuid: string | null
  reviewStatus: 'pending_review' | 'reviewed' | 'dismissed'
  aliasNames: string[]
  cleanupFlags: {
    imported: boolean
    needsReview: boolean
    reviewed: boolean
    possibleDuplicate: boolean
    noContactDetails: boolean
    noClientType: boolean
    servicem8Linked: boolean
  }
  contactCount: number
  projectCount: number
  lastActivityAt: Date
}

export type ClientCleanupFilter =
  | 'all'
  | 'imported'
  | 'needs_review'
  | 'reviewed'
  | 'possible_duplicates'
  | 'no_contact_details'
  | 'no_client_type'
  | 'servicem8_linked'

export type ClientListFilters = {
  search?: string | null
  cleanupFilter?: ClientCleanupFilter | null
}

export const CLIENT_LIST_PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const
export const DEFAULT_CLIENT_LIST_PAGE_SIZE = 10

export type ClientListPageSize = typeof CLIENT_LIST_PAGE_SIZE_OPTIONS[number]

export type ClientListPage = {
  rows: ClientListRow[]
  total: number
  page: number
  pageSize: ClientListPageSize
  pageCount: number
}

export type ClientListPagination = {
  page?: number | null
  pageSize?: number | null
}

type ClientDetailShapeInput = ClientShapeBase & {
  clientType: string | null
  notes: string | null
  reviewNote: string | null
  aliases: Array<{ alias: string; source: string }>
  contacts: Array<{
    id: string
    name: string | null
    email: string | null
    phone: string | null
    phoneNormalized: string | null
    updatedAt: Date
  }>
  leads: Array<{
    id: string
    projectType: string | null
    location: string | null
    servicem8JobNumber: string | null
    tier: string | null
    createdAt: Date
    updatedAt: Date
  }>
  quotes: Array<{
    id: string
    shortCode: string | null
    jobDescription: string | null
    jobAddress: string | null
    quoteValue: string | null
    statusTag: string | null
    createdAt: Date
    updatedAt: Date
  }>
  workOrders?: Array<{
    id: string
    jobNumber: string | null
    jobDescription: string | null
    jobAddress: string | null
    servicem8Status: string
    isCurrent: boolean
    createdAt: Date
    updatedAt: Date
  }>
}

export type ClientDetail = ClientListRow & {
  name: string
  email: string | null
  phone: string | null
  identityType: string | null
  clientType: string | null
  notes: string | null
  reviewNote: string | null
  sourceAliasNames: string[]
  manualAliasNames: string[]
  contacts: ClientDetailShapeInput['contacts']
  leads: ClientDetailShapeInput['leads']
  quotes: ClientDetailShapeInput['quotes']
  workOrders: NonNullable<ClientDetailShapeInput['workOrders']>
  projects: Array<{
    kind: 'lead' | 'quote' | 'work_order'
    id: string
    title: string
    address: string | null
    createdAt: Date
    updatedAt: Date
  }>
  recentActivity: Array<{
    kind: 'client' | 'contact' | 'lead' | 'quote' | 'work_order'
    id: string
    title: string
    detail: string | null
    occurredAt: Date
  }>
}

export function shapeClientListRows(rows: ClientListShapeInput[]): ClientListRow[] {
  const duplicateNames = findDuplicateNames(rows)

  return rows.map((row) => ({
    id: row.id,
    companyName: row.companyName || row.name,
    servicem8CompanyUuid: row.servicem8CompanyUuid,
    reviewStatus: row.reviewStatus,
    aliasNames: row.aliases.map((alias) => alias.alias),
    cleanupFlags: {
      imported: row.canonicalSource === 'import',
      needsReview: row.reviewStatus === 'pending_review',
      reviewed: row.reviewStatus === 'reviewed',
      possibleDuplicate: duplicateNames.has(normalizedDisplayName(row)),
      noContactDetails: row.contacts.length === 0 && !row.email && !row.phone,
      noClientType: row.identityType === null,
      servicem8Linked: Boolean(row.servicem8CompanyUuid),
    },
    contactCount: row.contacts.length,
    projectCount: row.leads.length + row.quotes.length + (row.workOrders ?? []).length,
    lastActivityAt: latestDate([
      row.createdAt,
      row.updatedAt,
      ...row.contacts.map((contact) => contact.updatedAt),
      ...row.leads.map((lead) => lead.updatedAt),
      ...row.quotes.map((quote) => quote.updatedAt),
      ...(row.workOrders ?? []).map((workOrder) => workOrder.updatedAt),
    ]),
  }))
}

export function filterClientListRows(rows: ClientListRow[], filters: ClientListFilters = {}): ClientListRow[] {
  const search = normalizeSearch(filters.search)
  const cleanupFilter = filters.cleanupFilter ?? 'all'

  return rows.filter((row) => {
    const matchesSearch = !search || [row.companyName, ...row.aliasNames]
      .some((value) => normalizeSearch(value).includes(search))

    return matchesSearch && matchesCleanupFilter(row, cleanupFilter)
  })
}

export function shapeClientDetail(row: ClientDetailShapeInput | null): ClientDetail | null {
  if (!row) return null
  const [summary] = shapeClientListRows([row])
  const workOrderRows = row.workOrders ?? []
  const projects: ClientDetail['projects'] = [
    ...row.leads.map((lead) => ({
      kind: 'lead' as const,
      id: lead.id,
      title: lead.projectType ?? lead.servicem8JobNumber ?? 'Lead',
      address: lead.location,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    })),
    ...row.quotes.map((quote) => ({
      kind: 'quote' as const,
      id: quote.id,
      title: quote.jobDescription ?? quote.shortCode ?? 'Quote',
      address: quote.jobAddress,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
    })),
    ...workOrderRows.map((workOrder) => ({
      kind: 'work_order' as const,
      id: workOrder.id,
      title: workOrder.jobDescription ?? workOrder.jobNumber ?? 'Work order',
      address: workOrder.jobAddress,
      createdAt: workOrder.createdAt,
      updatedAt: workOrder.updatedAt,
    })),
  ].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())

  return {
    ...summary,
    name: row.name,
    email: row.email,
    phone: row.phone,
    identityType: row.identityType,
    clientType: row.clientType,
    notes: row.notes,
    reviewNote: row.reviewNote,
    sourceAliasNames: row.aliases.filter((alias) => alias.source !== 'manual').map((alias) => alias.alias),
    manualAliasNames: row.aliases.filter((alias) => alias.source === 'manual').map((alias) => alias.alias),
    contacts: row.contacts,
    leads: row.leads,
    quotes: row.quotes,
    workOrders: workOrderRows,
    projects,
    recentActivity: shapeRecentActivity(row, workOrderRows),
  }
}

export async function getClientsList(filters: ClientListFilters = {}): Promise<ClientListRow[]> {
  const clientRows = await db.select().from(clients).where(eq(clients.isMerged, false)).orderBy(clients.name)
  const shaped = await Promise.all(clientRows.map(async (client) => {
    const [aliasesRows, contactsRows, leadRows, quoteRows, workOrderRows] = await Promise.all([
      db
        .select({ alias: clientAliases.alias })
        .from(clientAliases)
        .where(eq(clientAliases.clientId, client.id))
        .orderBy(clientAliases.alias),
      db
        .select({ id: clientContacts.id, updatedAt: clientContacts.updatedAt })
        .from(clientContacts)
        .where(eq(clientContacts.clientId, client.id)),
      db
        .select({ id: leads.id, updatedAt: leads.updatedAt })
        .from(leads)
        .where(and(eq(leads.clientId, client.id), isNull(leads.archivedAt))),
      db
        .select({ id: quotes.id, updatedAt: quotes.updatedAt })
        .from(quotes)
        .where(and(eq(quotes.clientId, client.id), isNull(quotes.archivedAt))),
      db
        .select({ id: workOrders.id, updatedAt: workOrders.updatedAt })
        .from(workOrders)
        .where(eq(workOrders.clientId, client.id)),
    ])

    return {
      ...client,
      aliases: aliasesRows,
      contacts: contactsRows,
      leads: leadRows,
      quotes: quoteRows,
      workOrders: workOrderRows,
    }
  }))

  return filterClientListRows(
    shapeClientListRows(shaped),
    filters,
  )
    .sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime())
}

export async function getClientsListPage(
  filters: ClientListFilters = {},
  pagination: ClientListPagination = {},
): Promise<ClientListPage> {
  return paginateClientListRows(await getClientsList(filters), pagination)
}

export function paginateClientListRows(
  rows: ClientListRow[],
  pagination: ClientListPagination = {},
): ClientListPage {
  const pageSize = normalizePageSize(pagination.pageSize)
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = clampPage(pagination.page, pageCount)
  const start = (page - 1) * pageSize

  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pageCount,
  }
}

export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  if (!UUID_RE.test(clientId)) return null

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1)
  if (!client) return null

  const [aliasesRows, contactsRows, leadRows, quoteRows, workOrderRows] = await Promise.all([
    db
      .select({ alias: clientAliases.alias, source: clientAliases.source })
      .from(clientAliases)
      .where(eq(clientAliases.clientId, client.id))
      .orderBy(clientAliases.alias),
    db
      .select({
        id: clientContacts.id,
        name: clientContacts.name,
        email: clientContacts.email,
        phone: clientContacts.phone,
        phoneNormalized: clientContacts.phoneNormalized,
        updatedAt: clientContacts.updatedAt,
      })
      .from(clientContacts)
      .where(eq(clientContacts.clientId, client.id))
      .orderBy(clientContacts.name),
    db
      .select({
        id: leads.id,
        projectType: leads.projectType,
        location: leads.location,
        servicem8JobNumber: leads.servicem8JobNumber,
        tier: leads.tier,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
      })
      .from(leads)
      .where(and(eq(leads.clientId, client.id), isNull(leads.archivedAt)))
      .orderBy(desc(leads.updatedAt)),
    db
      .select({
        id: quotes.id,
        shortCode: quotes.shortCode,
        jobDescription: quotes.jobDescription,
        jobAddress: quotes.jobAddress,
        quoteValue: quotes.quoteValue,
        statusTag: sql<string | null>`${currentQuoteStats().statusTag}`,
        createdAt: quotes.createdAt,
        updatedAt: quotes.updatedAt,
      })
      .from(quotes)
      .where(and(eq(quotes.clientId, client.id), isNull(quotes.archivedAt)))
      .orderBy(desc(quotes.updatedAt)),
    db
      .select({
        id: workOrders.id,
        jobNumber: workOrders.jobNumber,
        jobDescription: workOrders.jobDescription,
        jobAddress: workOrders.jobAddress,
        servicem8Status: workOrders.servicem8Status,
        isCurrent: workOrders.isCurrent,
        createdAt: workOrders.createdAt,
        updatedAt: workOrders.updatedAt,
      })
      .from(workOrders)
      .where(eq(workOrders.clientId, client.id))
      .orderBy(desc(workOrders.updatedAt)),
  ])

  return shapeClientDetail({
    ...client,
    aliases: aliasesRows,
    contacts: contactsRows,
    leads: leadRows,
    quotes: quoteRows,
    workOrders: workOrderRows,
  })
}

function shapeRecentActivity(
  row: ClientDetailShapeInput,
  workOrderRows: NonNullable<ClientDetailShapeInput['workOrders']>,
): ClientDetail['recentActivity'] {
  return [
    {
      kind: 'client' as const,
      id: row.id,
      title: 'Client updated',
      detail: row.companyName || row.name,
      occurredAt: row.updatedAt,
    },
    ...row.contacts.map((contact) => ({
      kind: 'contact' as const,
      id: contact.id,
      title: contact.name ?? 'Contact updated',
      detail: contact.email ?? contact.phone ?? contact.phoneNormalized,
      occurredAt: contact.updatedAt,
    })),
    ...row.leads.map((lead) => ({
      kind: 'lead' as const,
      id: lead.id,
      title: lead.projectType ?? lead.servicem8JobNumber ?? 'Lead',
      detail: lead.location,
      occurredAt: lead.updatedAt,
    })),
    ...row.quotes.map((quote) => ({
      kind: 'quote' as const,
      id: quote.id,
      title: quote.jobDescription ?? quote.shortCode ?? 'Quote',
      detail: quote.jobAddress,
      occurredAt: quote.updatedAt,
    })),
    ...workOrderRows.map((workOrder) => ({
      kind: 'work_order' as const,
      id: workOrder.id,
      title: workOrder.jobDescription ?? workOrder.jobNumber ?? 'Work order',
      detail: workOrder.jobAddress ?? workOrder.servicem8Status,
      occurredAt: workOrder.updatedAt,
    })),
  ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
}

function latestDate(dates: Date[]): Date {
  return dates.reduce((latest, date) => date.getTime() > latest.getTime() ? date : latest, dates[0])
}

function matchesCleanupFilter(row: ClientListRow, filter: ClientCleanupFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'imported') return row.cleanupFlags.imported
  if (filter === 'needs_review') return row.cleanupFlags.needsReview
  if (filter === 'reviewed') return row.cleanupFlags.reviewed
  if (filter === 'possible_duplicates') return row.cleanupFlags.possibleDuplicate
  if (filter === 'no_contact_details') return row.cleanupFlags.noContactDetails
  if (filter === 'no_client_type') return row.cleanupFlags.noClientType
  if (filter === 'servicem8_linked') return row.cleanupFlags.servicem8Linked
  return true
}

function findDuplicateNames(rows: ClientListShapeInput[]): Set<string> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const name = normalizedDisplayName(row)
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name))
}

function normalizedDisplayName(row: Pick<ClientShapeBase, 'name' | 'companyName'>): string {
  return normalizeSearch(row.companyName || row.name)
}

function normalizeSearch(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizePageSize(value: number | null | undefined): ClientListPageSize {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CLIENT_LIST_PAGE_SIZE
  const pageSize = Math.trunc(value)
  return CLIENT_LIST_PAGE_SIZE_OPTIONS.includes(pageSize as ClientListPageSize)
    ? pageSize as ClientListPageSize
    : DEFAULT_CLIENT_LIST_PAGE_SIZE
}

function clampPage(value: number | null | undefined, pageCount: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(Math.max(Math.trunc(value), 1), pageCount)
}
