// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  processWorkOrderEnrichmentBatch,
  type WorkOrderEnrichmentRuntimeStore,
} from '../enrichment-worker'
import { createEmptyProductionSpecification } from '../production-specifications'

describe('Work Order enrichment worker', () => {
  it('revalidates provider output against the active shared catalogue', async () => {
    const savedDrafts: unknown[] = []
    const store: WorkOrderEnrichmentRuntimeStore = {
      claim: async () => [{
        id: 'job-shared-catalogue',
        workOrderItemId: 'item-shared-catalogue',
        sourceDescription: 'Custom rail system',
        attemptCount: 1,
        extractionSchemaVersion: 1,
        promptVersion: 'production-specification-v1',
      }],
      saveDraft: async (_job, output) => {
        savedDrafts.push(output)
        return 'saved'
      },
      markRetry: async () => undefined,
      markFailed: async () => undefined,
    }
    const specification = createEmptyProductionSpecification()
    specification.system = { state: 'selected', catalogueId: 'system.custom-rail' }

    const result = await processWorkOrderEnrichmentBatch({
      store,
      provider: async () => ({
        schemaVersion: 1,
        specification,
        evidence: [{ field: 'system', sourceText: 'Custom rail system' }],
        ambiguityFlags: [],
      }),
      loadCatalogue: async () => [{
        id: 'system.custom-rail',
        field: 'system',
        displayLabel: 'Custom Rail',
        productionLabel: 'Custom Rail',
        aliases: [],
        isActive: true,
      }],
    })

    expect({ result, savedCount: savedDrafts.length }).toEqual({
      result: {
        claimed: 1,
        drafted: 1,
        retried: 0,
        failed: 0,
        skippedConfirmed: 0,
        skippedInactive: 0,
        skippedStaffEdited: 0,
      },
      savedCount: 1,
    })
  })

  it('reports an inactive item separately from a confirmed specification', async () => {
    const store: WorkOrderEnrichmentRuntimeStore = {
      claim: async () => [{
        id: 'job-inactive',
        workOrderItemId: 'item-inactive',
        sourceDescription: 'Shower glass',
        attemptCount: 1,
        extractionSchemaVersion: 1,
        promptVersion: 'production-specification-v1',
      }],
      saveDraft: async () => 'skipped_inactive',
      markRetry: async () => undefined,
      markFailed: async () => undefined,
    }

    const result = await processWorkOrderEnrichmentBatch({
      store,
      provider: async () => validEmptyEnrichmentOutput(),
    })

    expect(result).toEqual({
      claimed: 1,
      drafted: 0,
      retried: 0,
      failed: 0,
      skippedConfirmed: 0,
      skippedInactive: 1,
      skippedStaffEdited: 0,
    })
  })

  it('rejects invalid timeout configuration even when no work is queued', async () => {
    const store: WorkOrderEnrichmentRuntimeStore = {
      claim: async () => [],
      saveDraft: async () => 'saved',
      markRetry: async () => undefined,
      markFailed: async () => undefined,
    }

    await expect(processWorkOrderEnrichmentBatch({
      store,
      timeoutMs: 0,
    })).rejects.toThrow('timeoutMs must be between 1 and 120000.')
  })

  it('stores a staff-safe terminal failure without leaking provider detail', async () => {
    const failures: Array<{ jobId: string; safeError: string }> = []
    const store: WorkOrderEnrichmentRuntimeStore = {
      claim: async () => [{
        id: 'job-1',
        workOrderItemId: 'item-1',
        sourceDescription: 'Shower glass',
        attemptCount: 3,
        extractionSchemaVersion: 1,
        promptVersion: 'production-specification-v1',
      }],
      saveDraft: async () => 'saved',
      markRetry: async () => undefined,
      markFailed: async (jobId, safeError) => {
        failures.push({ jobId, safeError })
      },
    }

    const result = await processWorkOrderEnrichmentBatch({
      store,
      provider: async () => {
        throw new Error('sk-live-secret: client Jane provider quota exhausted')
      },
      maxAttempts: 3,
    })

    expect(result).toEqual({
      claimed: 1,
      drafted: 0,
      retried: 0,
      failed: 1,
      skippedConfirmed: 0,
      skippedInactive: 0,
      skippedStaffEdited: 0,
    })
    expect(failures).toEqual([{
      jobId: 'job-1',
      safeError: 'Enrichment failed. Retry is available.',
    }])
    expect(JSON.stringify(failures)).not.toContain('sk-live-secret')
    expect(JSON.stringify(failures)).not.toContain('Jane')
  })

  it('rejects invalid provider output before persistence and schedules a safe retry', async () => {
    const savedDrafts: unknown[] = []
    const retries: Array<{ jobId: string; availableAt: Date; safeError: string }> = []
    const store: WorkOrderEnrichmentRuntimeStore = {
      claim: async () => [{
        id: 'job-2',
        workOrderItemId: 'item-2',
        sourceDescription: 'Chrome shower fittings',
        attemptCount: 1,
        extractionSchemaVersion: 1,
        promptVersion: 'production-specification-v1',
      }],
      saveDraft: async (_job, output) => {
        savedDrafts.push(output)
        return 'saved'
      },
      markRetry: async (jobId, availableAt, safeError) => {
        retries.push({ jobId, availableAt, safeError })
      },
      markFailed: async () => undefined,
    }
    const invalidSpecification = {
      ...createEmptyProductionSpecification(),
      status: 'confirmed',
    }

    const result = await processWorkOrderEnrichmentBatch({
      store,
      provider: async () => ({
        schemaVersion: 1,
        specification: invalidSpecification,
        evidence: [],
        ambiguityFlags: [],
      } as never),
      now: () => new Date('2026-07-17T00:00:00.000Z'),
    })

    expect(result).toEqual({
      claimed: 1,
      drafted: 0,
      retried: 1,
      failed: 0,
      skippedConfirmed: 0,
      skippedInactive: 0,
      skippedStaffEdited: 0,
    })
    expect(savedDrafts).toEqual([])
    expect(retries).toEqual([{
      jobId: 'job-2',
      availableAt: new Date('2026-07-17T00:01:00.000Z'),
      safeError: 'Enrichment delayed. Retrying automatically.',
    }])
  })

  it('fails a stale versioned job without executing it under current extraction rules', async () => {
    const failures: Array<{ jobId: string; safeError: string }> = []
    let providerCalls = 0
    const store: WorkOrderEnrichmentRuntimeStore = {
      claim: async () => [{
        id: 'job-stale-version',
        workOrderItemId: 'item-stale-version',
        sourceDescription: 'Shower glass',
        attemptCount: 1,
        extractionSchemaVersion: 0,
        promptVersion: 'production-specification-v0',
      }],
      saveDraft: async () => 'saved',
      markRetry: async () => undefined,
      markFailed: async (jobId, safeError) => {
        failures.push({ jobId, safeError })
      },
    }

    const result = await processWorkOrderEnrichmentBatch({
      store,
      provider: async () => {
        providerCalls += 1
        return validEmptyEnrichmentOutput()
      },
    })

    expect({ result, providerCalls, failures }).toEqual({
      result: {
        claimed: 1,
        drafted: 0,
        retried: 0,
        failed: 1,
        skippedConfirmed: 0,
        skippedInactive: 0,
        skippedStaffEdited: 0,
      },
      providerCalls: 0,
      failures: [{
        jobId: 'job-stale-version',
        safeError: 'Enrichment rules changed. Retry to use the current version.',
      }],
    })
  })
})

function validEmptyEnrichmentOutput() {
  return {
    schemaVersion: 1 as const,
    specification: createEmptyProductionSpecification(),
    evidence: [],
    ambiguityFlags: [],
  }
}
