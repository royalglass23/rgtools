// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryResults = vi.hoisted(() => [] as unknown[][])
const whereCalls = vi.hoisted(() => [] as unknown[])

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  desc: vi.fn((column: { name?: string }) => ({ direction: 'desc', column: column.name })),
  eq: vi.fn((column: { name?: string }, value: unknown) => ({ type: 'eq', column: column.name, value })),
  isNull: vi.fn((column: { name?: string }) => ({ type: 'isNull', column: column.name })),
  sql: vi.fn(() => ({ type: 'sql', mapWith() { return this } })),
}))

vi.mock('@rgtools/db/schema', () => ({
  quotes: {
    id: { name: 'quotes.id' },
    clientId: { name: 'quotes.client_id' },
    shortCode: { name: 'quotes.short_code' },
    jobDescription: { name: 'quotes.job_description' },
    jobAddress: { name: 'quotes.job_address' },
    quoteValue: { name: 'quotes.quote_value' },
    statusTag: { name: 'quotes.status_tag' },
    archivedAt: { name: 'quotes.archived_at' },
    createdAt: { name: 'quotes.created_at' },
    updatedAt: { name: 'quotes.updated_at' },
  },
}))

vi.mock('@rgtools/db/schema-leads', () => ({
  clientAliases: {
    alias: { name: 'client_aliases.alias' },
    clientId: { name: 'client_aliases.client_id' },
    source: { name: 'client_aliases.source' },
  },
  clientContacts: {
    id: { name: 'client_contacts.id' },
    clientId: { name: 'client_contacts.client_id' },
    name: { name: 'client_contacts.name' },
    email: { name: 'client_contacts.email' },
    phone: { name: 'client_contacts.phone' },
    phoneNormalized: { name: 'client_contacts.phone_normalized' },
    updatedAt: { name: 'client_contacts.updated_at' },
  },
  clients: {
    id: { name: 'clients.id' },
    name: { name: 'clients.name' },
    isMerged: { name: 'clients.is_merged' },
  },
  leads: {
    id: { name: 'leads.id' },
    clientId: { name: 'leads.client_id' },
    projectType: { name: 'leads.project_type' },
    location: { name: 'leads.location' },
    servicem8JobNumber: { name: 'leads.servicem8_job_number' },
    tier: { name: 'leads.tier' },
    archivedAt: { name: 'leads.archived_at' },
    createdAt: { name: 'leads.created_at' },
    updatedAt: { name: 'leads.updated_at' },
  },
}))

vi.mock('@rgtools/db/schema-workorders', () => ({
  workOrders: {
    id: { name: 'work_orders.id' },
    clientId: { name: 'work_orders.client_id' },
    jobNumber: { name: 'work_orders.job_number' },
    jobDescription: { name: 'work_orders.job_description' },
    jobAddress: { name: 'work_orders.job_address' },
    servicem8Status: { name: 'work_orders.servicem8_status' },
    isCurrent: { name: 'work_orders.is_current' },
    createdAt: { name: 'work_orders.created_at' },
    updatedAt: { name: 'work_orders.updated_at' },
  },
}))

function queryBuilder(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  builder.where = vi.fn((condition: unknown) => {
    whereCalls.push(condition)
    return builder
  })
  builder.orderBy = vi.fn(async () => result)
  builder.limit = vi.fn(async () => result)
  builder.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(result).then(resolve)
  return builder
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => queryBuilder(queryResults.shift() ?? [])),
    })),
  },
}))

import { getClientDetail, getClientsList } from '../queries'

const clientId = 'd1a658e4-bc26-47b8-8dfa-535f86545991'

beforeEach(() => {
  vi.clearAllMocks()
  queryResults.length = 0
  whereCalls.length = 0
})

describe('getClientDetail direct access', () => {
  it('lists imported clients before their projects are linked', async () => {
    queryResults.push([
      {
        id: clientId,
        name: 'Imported Projectless Client',
        companyName: null,
        email: null,
        phone: null,
        servicem8CompanyUuid: 'company-projectless',
        canonicalSource: 'import',
        reviewStatus: 'pending_review',
        identityType: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-07-01T00:00:00Z'),
      },
    ])
    queryResults.push([])
    queryResults.push([])
    queryResults.push([])
    queryResults.push([])
    queryResults.push([])

    await expect(getClientsList()).resolves.toEqual([
      expect.objectContaining({
        id: clientId,
        companyName: 'Imported Projectless Client',
        projectCount: 0,
      }),
    ])
  })

  it('returns detail for an imported client with no linked projects yet', async () => {
    queryResults.push([
      {
        id: clientId,
        name: 'Imported Projectless Client',
        companyName: null,
        email: null,
        phone: null,
        servicem8CompanyUuid: null,
        canonicalSource: 'import',
        reviewStatus: 'pending_review',
        identityType: null,
        clientType: null,
        notes: null,
        reviewNote: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-07-01T00:00:00Z'),
      },
    ])
    queryResults.push([])
    queryResults.push([])
    queryResults.push([])
    queryResults.push([])
    queryResults.push([])

    await expect(getClientDetail(clientId)).resolves.toEqual(expect.objectContaining({
      id: clientId,
      companyName: 'Imported Projectless Client',
      projectCount: 0,
      projects: [],
    }))

    expect(whereCalls).toEqual(expect.arrayContaining([
      {
        type: 'and',
        conditions: [
          { type: 'eq', column: 'leads.client_id', value: clientId },
          { type: 'isNull', column: 'leads.archived_at' },
        ],
      },
      {
        type: 'and',
        conditions: [
          { type: 'eq', column: 'quotes.client_id', value: clientId },
          { type: 'isNull', column: 'quotes.archived_at' },
        ],
      },
    ]))
  })
})
