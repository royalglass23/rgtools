// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  syncQuoteMovementFromServiceM8,
  type QuoteMovementSnapshotInput,
  type QuoteMovementSnapshotRepository,
} from '../sync'

function createMemoryRepository() {
  const rows = new Map<string, QuoteMovementSnapshotInput & { active: boolean }>()
  const failures: string[] = []

  const repository: QuoteMovementSnapshotRepository = {
    async replaceActiveSnapshot(records) {
      for (const [uuid, record] of rows) rows.set(uuid, { ...record, active: false })
      for (const record of records) rows.set(record.servicem8JobUuid, { ...record, active: true })
    },
    async recordFailure(message) {
      failures.push(message)
    },
  }

  return {
    repository,
    failures,
    activeRows: () => Array.from(rows.values()).filter((row) => row.active),
  }
}

describe('syncQuoteMovementFromServiceM8', () => {
  it('caches every active Quote job across ServiceM8 pages using read-only requests', async () => {
    const memory = createMemoryRepository()
    const requestedMethods: Array<string | undefined> = []
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requestedMethods.push(init?.method)
      const url = new URL(path, 'https://servicem8.example')
      const cursor = url.searchParams.get('cursor')

      if (url.pathname === '/job.json') {
        if (cursor === '-1') {
          return Response.json([{
            uuid: 'job-1',
            active: 1,
            status: 'Quote',
            company_uuid: 'company-1',
            generated_job_id: 'Q260101',
            job_address: '1 Glass Lane',
            edit_date: '2026-07-17T01:00:00Z',
          }], { headers: { 'x-next-cursor': 'job-page-2' } })
        }
        return Response.json([{
          uuid: 'job-2',
          active: '1',
          status: ' Quote ',
          company_uuid: 'company-2',
          generated_job_id: 'Q260102',
          job_address: '2 Window Road',
          edit_date: '2026-07-17T02:00:00Z',
        }])
      }

      if (url.pathname === '/company.json') {
        return Response.json([
          { uuid: 'company-1', name: 'Alpha Homes' },
          { uuid: 'company-2', name: 'Beta Builds' },
        ])
      }

      if (url.pathname === '/jobmaterial.json') {
        return Response.json([
          { uuid: 'line-1', active: 1, job_uuid: 'job-1', quantity: '2', price: '100' },
          { uuid: 'line-2', active: 1, job_uuid: 'job-2', quantity: '1', price: '75.50' },
          { uuid: 'old-line', active: 0, job_uuid: 'job-1', quantity: '1', price: '999' },
        ])
      }

      return Response.json([], { status: 404 })
    })
    const now = new Date('2026-07-17T03:00:00Z')

    await expect(syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
      actorId: 'user-1',
      now: () => now,
    })).resolves.toEqual({ synced: 2, refreshedAt: now })

    expect(memory.activeRows()).toEqual([
      expect.objectContaining({
        servicem8JobUuid: 'job-1',
        jobNumber: 'Q260101',
        customerName: 'Alpha Homes',
        jobAddress: '1 Glass Lane',
        quoteValueExcludingGst: '200.00',
        servicem8Status: 'Quote',
      }),
      expect.objectContaining({
        servicem8JobUuid: 'job-2',
        jobNumber: 'Q260102',
        customerName: 'Beta Builds',
        quoteValueExcludingGst: '75.50',
        servicem8Status: 'Quote',
      }),
    ])
    expect(requestedMethods.every((method) => method === undefined || method === 'GET')).toBe(true)
    expect(request.mock.calls.map(([path]) => path)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^\/job\.json.*cursor=-1/),
      expect.stringMatching(/^\/job\.json.*cursor=job-page-2/),
    ]))
  })

  it('keeps the previous cached snapshot when ServiceM8 refresh fails', async () => {
    const memory = createMemoryRepository()
    await memory.repository.replaceActiveSnapshot([{
      servicem8JobUuid: 'cached-job',
      servicem8CompanyUuid: null,
      servicem8Status: 'Quote',
      jobNumber: 'Q260099',
      customerName: 'Cached Customer',
      jobAddress: null,
      quoteValueExcludingGst: '500.00',
      sourceUpdatedAt: null,
      lastServiceM8SyncedAt: new Date('2026-07-16T03:00:00Z'),
    }], { actorId: 'user-1', refreshedAt: new Date('2026-07-16T03:00:00Z') })
    const request = vi.fn(async (path: string) => (
      path.startsWith('/job.json') ? Response.json([], { status: 503 }) : Response.json([])
    ))

    await expect(syncQuoteMovementFromServiceM8({
      request,
      repository: memory.repository,
      actorId: 'user-1',
    })).rejects.toThrow('ServiceM8 Quote Movement refresh failed with HTTP 503.')

    expect(memory.activeRows()).toEqual([
      expect.objectContaining({ servicem8JobUuid: 'cached-job', customerName: 'Cached Customer' }),
    ])
    expect(memory.failures).toEqual(['ServiceM8 Quote Movement refresh failed with HTTP 503.'])
  })
})
