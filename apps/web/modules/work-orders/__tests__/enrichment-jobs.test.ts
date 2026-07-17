// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const selectedRows = vi.hoisted(() => [] as Array<Record<string, unknown>>)
const insertedValues = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ column, values })),
}))

vi.mock('@rgtools/db/schema-workorders', () => ({
  workOrderItemEnrichmentJobs: {
    id: { name: 'job.id' },
    workOrderItemId: { name: 'job.work_order_item_id' },
    sourceDescriptionFingerprint: { name: 'job.source_description_fingerprint' },
    extractionSchemaVersion: { name: 'job.extraction_schema_version' },
    promptVersion: { name: 'job.prompt_version' },
  },
  workOrderItemProductionSpecifications: {
    id: { name: 'specification.id' },
    workOrderItemId: { name: 'specification.work_order_item_id' },
  },
  workOrderItems: {
    id: { name: 'item.id' },
    workOrderId: { name: 'item.work_order_id' },
    servicem8ItemUuid: { name: 'item.servicem8_item_uuid' },
    isActive: { name: 'item.is_active' },
  },
  workOrders: {
    id: { name: 'work_order.id' },
    clientName: { name: 'work_order.client_name' },
    companyName: { name: 'work_order.company_name' },
    jobAddress: { name: 'work_order.job_address' },
  },
}))

vi.mock('../item-label-lifecycle', () => ({
  fingerprintSourceDescription: vi.fn(() => 'fingerprint-1'),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const builder: Record<string, unknown> = {}
      builder.from = vi.fn(() => builder)
      builder.leftJoin = vi.fn(() => builder)
      builder.innerJoin = vi.fn(() => builder)
      builder.where = vi.fn(async () => selectedRows)
      return builder
    }),
    insert: vi.fn(() => ({
      values: vi.fn((values: Array<Record<string, unknown>>) => {
        insertedValues.push(...values)
        return {
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => values.map((_, index) => ({ id: `job-${index + 1}` }))),
          })),
        }
      }),
    })),
  },
}))

import { queueWorkOrderItemEnrichments } from '../enrichment-jobs'

beforeEach(() => {
  selectedRows.length = 0
  insertedValues.length = 0
})

describe('queueWorkOrderItemEnrichments', () => {
  it('persists provider source text without the known client or job address', async () => {
    selectedRows.push({
      id: 'item-1',
      servicem8ItemUuid: 'servicem8-item-1',
      specificationId: null,
      clientName: 'Jane Smith',
      companyName: 'Smith Holdings',
      jobAddress: '19 Glass Lane',
    })

    await queueWorkOrderItemEnrichments([{
      servicem8ItemUuid: 'servicem8-item-1',
      originalDescription: 'Install for Jane Smith of Smith Holdings at 19 Glass Lane. Price $999.',
    }])

    expect(insertedValues[0]?.sourceDescription).toBe(
      'Install for [redacted client] of [redacted client] at [redacted address]. Price [redacted price].',
    )
  })

  it('queues safe siblings when one candidate is too large for enrichment', async () => {
    selectedRows.push(
      {
        id: 'item-oversized',
        servicem8ItemUuid: 'servicem8-item-oversized',
        specificationId: null,
        clientName: 'Jane Smith',
        companyName: null,
        jobAddress: '19 Glass Lane',
      },
      {
        id: 'item-safe',
        servicem8ItemUuid: 'servicem8-item-safe',
        specificationId: null,
        clientName: 'Jane Smith',
        companyName: null,
        jobAddress: '19 Glass Lane',
      },
    )

    await expect(queueWorkOrderItemEnrichments([
      {
        servicem8ItemUuid: 'servicem8-item-oversized',
        originalDescription: 'x'.repeat(12_001),
      },
      {
        servicem8ItemUuid: 'servicem8-item-safe',
        originalDescription: '10 mm toughened shower glass',
      },
    ])).resolves.toEqual({ queued: 1, rejected: 1 })

    expect(insertedValues).toEqual([
      expect.objectContaining({
        workOrderItemId: 'item-safe',
        sourceDescription: '10 mm toughened shower glass',
      }),
    ])
  })
})
