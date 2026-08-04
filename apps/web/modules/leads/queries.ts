import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clients, leads } from '@rgtools/db/schema-leads'
import { getActiveScoringOptionLists } from '@/modules/lead-intake/scoring/config-options'
import { optionPoints, type MatrixFieldKey } from '@/modules/lead-intake/scoring/score-lead'
import { DEFAULT_LEADS_PREFS, LEADS_SORT_COLUMNS } from './table-prefs-shared'

export const STALE_LEAD_DAYS = 7

export type LeadsListFilters = {
  q: string
  tier: 'all' | 'A' | 'B' | 'C' | 'D' | 'E'
  sm8: 'all' | 'linked' | 'pending' | 'failed'
  date: '7' | '30' | 'all'
  stale: boolean
  statusView: 'current_quotes' | 'all_statuses' | 'archived'
  page: number
  size: 5 | 10 | 20 | 50 | 100
  sortColumn: string
  sortDir: 'asc' | 'desc'
}

export type ParseLeadsListFiltersOptions = {
  /** Prefix applied to every param name, e.g. `leads_` when the table is embedded alongside others. */
  prefix?: string
  /** Default values (admin-set) used when a param is absent from the URL. */
  defaults?: Partial<Record<'tier' | 'sm8' | 'date' | 'size' | 'sortColumn' | 'sortDir', string>>
  isAdmin?: boolean
}

export type LeadsListSort = {
  sortColumn?: string
  sortDir?: 'asc' | 'desc'
}

export type GetLeadsListOptions = {
  isAdmin?: boolean
}

export function parseLeadsListFilters(
  searchParams: Record<string, string | string[] | undefined>,
  options: ParseLeadsListFiltersOptions = {},
): LeadsListFilters {
  const { prefix = '', defaults = {}, isAdmin = false } = options
  const pick = (name: 'tier' | 'sm8' | 'date' | 'size' | 'sortColumn' | 'sortDir') =>
    stringValue(searchParams[`${prefix}${name}`]) ?? defaults[name]

  const q = stringValue(searchParams[`${prefix}q`])?.trim() ?? ''
  const tier = pick('tier')
  const sm8 = pick('sm8')
  const date = pick('date')
  const stale = stringValue(searchParams[`${prefix}stale`]) === 'true'
  const statusView = parseStatusView(stringValue(searchParams[`${prefix}statusView`]), isAdmin)
  const page = Number(stringValue(searchParams[`${prefix}page`]) ?? '1')
  const size = Number(pick('size') ?? '10')
  const sortColumn = pick('sortColumn') ?? DEFAULT_LEADS_PREFS.sortColumn
  const sortDir = pick('sortDir')

  return {
    q,
    tier: tier === 'A' || tier === 'B' || tier === 'C' || tier === 'D' || tier === 'E' ? tier : 'all',
    sm8: sm8 === 'linked' || sm8 === 'pending' || sm8 === 'failed' ? sm8 : 'all',
    date: date === '7' || date === '30' || date === 'all' ? date : '30',
    stale,
    statusView,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: size === 5 || size === 20 || size === 50 || size === 100 ? size : 10,
    sortColumn: LEADS_SORT_COLUMNS.includes(sortColumn as (typeof LEADS_SORT_COLUMNS)[number])
      ? sortColumn
      : DEFAULT_LEADS_PREFS.sortColumn,
    sortDir: sortDir === 'asc' ? 'asc' : 'desc',
  }
}

export async function getLeadsList(filters: LeadsListFilters, sort: LeadsListSort = filters, options: GetLeadsListOptions = {}) {
  const where = listWhere(filters, options)
  const offset = (filters.page - 1) * filters.size

  const [totalRow] = await db
    .select({ total: count() })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(where)
  const rows = await db
    .select({
      id: leads.id,
      createdAt: leads.createdAt,
      clientName: clients.name,
      companyName: clients.companyName,
      location: leads.location,
      projectType: leads.product,
      tier: leads.tier,
      seedScore: leads.seedScore,
      servicem8JobUuid: leads.servicem8JobUuid,
      servicem8JobNumber: leads.servicem8JobNumber,
      servicem8Status: leads.servicem8Status,
      syncStatus: leads.syncStatus,
      completeness: leads.completeness,
      rcStatus: leads.resourceConsent,
      bcStatus: leads.buildingConsent,
      buildingStage: leads.buildingStage,
      followUpDate: leads.followUpDate,
      updatedAt: leads.updatedAt,
      aiSuggestion: leads.aiSuggestion,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(where)
    .orderBy(...listOrderBy(sort))
    .limit(filters.size)
    .offset(offset)

  return {
    rows,
    total: totalRow?.total ?? 0,
    pageCount: Math.max(1, Math.ceil((totalRow?.total ?? 0) / filters.size)),
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getLeadDetail(leadId: string) {
  if (!UUID_RE.test(leadId)) return null

  const [lead] = await db
    .select({
      id: leads.id,
      createdAt: leads.createdAt,
      clientName: clients.name,
      companyName: clients.companyName,
      phone: clients.phone,
      email: clients.email,
      location: leads.location,
      source: leads.source,
      channel: leads.channel,
      projectType: leads.projectType,
      product: leads.product,
      freeText: leads.jobDescription,
      budgetBand: leads.budgetBand,
      consentStatus: leads.consentStatus,
      decisionMakers: leads.decisionMakers,
      priceSensitivityRead: leads.priceSensitivity,
      tier: leads.tier,
      seedScore: leads.seedScore,
      completeness: leads.completeness,
      strikeFlag: leads.strikeFlag,
      scoreReason: leads.scoreReason,
      servicem8JobUuid: leads.servicem8JobUuid,
      servicem8JobNumber: leads.servicem8JobNumber,
      servicem8Status: leads.servicem8Status,
      rcStatus: leads.resourceConsent,
      bcStatus: leads.buildingConsent,
      buildingStage: leads.buildingStage,
      clientTypeAnswer: leads.clientTypeAnswer,
      distanceBand: leads.distanceBand,
      paymentHistory: leads.paymentHistory,
      siteAccess: leads.siteAccess,
      installationHeight: leads.installationHeight,
      followUpDate: leads.followUpDate,
      updatedAt: leads.updatedAt,
      aiSuggestion: leads.aiSuggestion,
      aiSuggestionAt: leads.aiSuggestionAt,
    })
    .from(leads)
    .innerJoin(clients, eq(leads.clientId, clients.id))
    .where(and(eq(leads.id, leadId), isNull(leads.archivedAt)))
    .limit(1)

  if (!lead) return null

  const optionLists = await getActiveScoringOptionLists()
  const scoredFieldValues: Record<number, string | null> = {
    1: lead.clientTypeAnswer,
    2: lead.budgetBand,
    4: lead.projectType,
    5: lead.priceSensitivityRead,
    6: lead.decisionMakers,
    7: lead.distanceBand,
    8: lead.rcStatus,
    9: lead.bcStatus,
    10: lead.buildingStage,
    11: lead.source,
    12: lead.paymentHistory,
    13: lead.siteAccess,
    14: lead.installationHeight,
  }
  const scoredFields = Object.keys(optionLists.categories).sort((left, right) => Number(left) - Number(right)).map((categoryKey) => {
    const category = Number(categoryKey)
    const configCategory = optionLists.categories[String(category)]
    const label = configCategory?.label ?? categoryLabel(category)
    const answerKey = scoredFieldValues[category]
    const selected = configCategory?.options.find((option) => option.key === answerKey)?.label
    const fieldKey = MATRIX_FIELD_BY_CATEGORY[category]

    return {
      category,
      label: cleanDisplayText(label),
      answer: cleanDisplayText(selected ?? answerKey ?? 'Not selected'),
      points: fieldKey && answerKey ? optionPoints(fieldKey, answerKey) : 0,
    }
  })

  return {
    ...lead,
    scoredFields,
    projectType: lead.product ?? lead.projectType,
    distanceBand: scoredFields.find((field) => field.category === 7)?.answer ?? 'Not selected',
  }
}

const MATRIX_FIELD_BY_CATEGORY: Partial<Record<number, MatrixFieldKey>> = {
  1: 'clientType',
  2: 'budgetBand',
  4: 'projectType',
  5: 'priceSensitivity',
  6: 'decisionMakers',
  7: 'distanceBand',
  8: 'resourceConsent',
  9: 'buildingConsent',
  10: 'buildingStage',
  11: 'source',
  12: 'paymentHistory',
  13: 'siteAccess',
  14: 'installationHeight',
}

function cleanDisplayText(value: string) {
  return value
    .replaceAll('â€“', '-')
    .replaceAll('â€”', '-')
    .replaceAll('â€‘', '-')
    .replaceAll('Ã¢â‚¬â€œ', '-')
    .replaceAll('Ã¢â‚¬â€', '-')
    .replaceAll('Ã¢â‚¬â€˜', '-')
}

function listWhere(filters: LeadsListFilters, options: GetLeadsListOptions = {}) {
  const statusView = filters.statusView === 'archived' && !options.isAdmin ? 'current_quotes' : filters.statusView
  const conditions = statusView === 'archived'
    ? [isNotNull(leads.archivedAt)]
    : [isNull(leads.archivedAt)]

  if (statusView === 'current_quotes') {
    const currentQuoteCondition = or(
      isNull(leads.servicem8JobUuid),
      sql`lower(trim(coalesce(${leads.servicem8Status}, ''))) = 'quote'`,
    )
    if (currentQuoteCondition) conditions.push(currentQuoteCondition)
  }

  if (filters.tier !== 'all') conditions.push(eq(leads.tier, filters.tier))
  if (filters.sm8 === 'linked') conditions.push(isNotNull(leads.servicem8JobUuid))
  if (filters.sm8 === 'pending') {
    conditions.push(isNull(leads.servicem8JobUuid))
    conditions.push(ne(leads.syncStatus, 'sync_failed'))
  }
  if (filters.sm8 === 'failed') conditions.push(eq(leads.syncStatus, 'sync_failed'))
  if (filters.date !== 'all') {
    const start = new Date()
    start.setDate(start.getDate() - Number(filters.date))
    conditions.push(gte(leads.createdAt, start))
  }
  if (filters.stale) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - STALE_LEAD_DAYS)
    conditions.push(isNotNull(leads.servicem8JobUuid))
    conditions.push(ne(leads.syncStatus, 'sync_failed'))
    conditions.push(lte(leads.createdAt, cutoff))
  }
  if (filters.q) {
    const query = `%${escapeLike(filters.q)}%`
    const searchCondition = or(
      ilike(clients.name, query),
      ilike(clients.companyName, query),
      ilike(clients.email, query),
      ilike(clients.phone, query),
      ilike(leads.location, query),
      ilike(leads.product, query),
      ilike(leads.externalRef, query),
      ilike(leads.servicem8JobNumber, query),
    )
    if (searchCondition) conditions.push(searchCondition)
  }

  return and(...conditions) ?? sql`true`
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function listOrderBy(sort: LeadsListSort) {
  const validSortColumn = LEADS_SORT_COLUMNS.includes(sort.sortColumn as (typeof LEADS_SORT_COLUMNS)[number])
  const sortableColumn = validSortColumn ? sort.sortColumn : DEFAULT_LEADS_PREFS.sortColumn
  const sortDir = validSortColumn ? sort.sortDir : DEFAULT_LEADS_PREFS.sortDir
  const direction = sortDir === 'asc' ? asc : desc

  if (sortableColumn === 'clientName') return [direction(clients.name), desc(leads.createdAt)]
  if (sortableColumn === 'tier') return [direction(leads.tier), desc(leads.createdAt)]
  if (sortableColumn === 'seedScore') return [direction(leads.seedScore), desc(leads.createdAt)]
  if (sortableColumn === 'completeness') return [direction(leads.completeness), desc(leads.createdAt)]
  if (sortableColumn === 'followUpDate') return [direction(leads.followUpDate), desc(leads.createdAt)]
  if (sortableColumn === 'updatedAt') return [direction(leads.updatedAt), desc(leads.createdAt)]

  return [direction(leads.createdAt)]
}

function stringValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function parseStatusView(value: string | undefined, isAdmin: boolean): LeadsListFilters['statusView'] {
  if (value === 'all_statuses') return 'all_statuses'
  if (value === 'archived' && isAdmin) return 'archived'
  return 'current_quotes'
}

function categoryLabel(category: number) {
  const labels: Record<number, string> = {
    1: 'Client Type',
    2: 'Budget Band',
    4: 'Complexity',
    5: 'Price-sensitivity Read',
    6: 'Decision-makers',
    7: 'Distance',
    8: 'Resource Consent',
    9: 'Building Consent',
    10: 'Building Stage',
    11: 'Source',
    12: 'Payment History',
    13: 'Site Access',
    14: 'Installation Height',
  }

  return labels[category] ?? `Category ${category}`
}
