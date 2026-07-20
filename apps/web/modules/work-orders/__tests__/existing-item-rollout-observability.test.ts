// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { emitExistingItemRolloutMetric } from '../existing-item-rollout-observability'

describe('existing-item rollout observability', () => {
  it('emits correlated counts and safe failure class without sensitive source data', () => {
    const log = vi.fn()

    emitExistingItemRolloutMetric({
      id: 'rollout-observed-1',
      correlationId: 'correlation-observed-1',
      state: 'failed',
      total: 100,
      queued: 0,
      processing: 0,
      drafted: 96,
      needsReview: 90,
      unmapped: 6,
      failed: 4,
      retried: 7,
      skippedRemoved: 2,
      skippedConfirmed: 3,
      skippedCurrentKey: 5,
      startedAt: new Date('2026-07-20T03:00:00.000Z'),
      completedAt: new Date('2026-07-20T03:02:00.000Z'),
      durationMs: 120_000,
      safeFailureClass: 'enrichment_failed',
    }, log)

    expect(log).toHaveBeenCalledWith({
      action: 'work_order.existing_item_rollout_status',
      rolloutRunId: 'rollout-observed-1',
      correlationId: 'correlation-observed-1',
      state: 'failed',
      counts: {
        total: 100,
        queued: 0,
        processing: 0,
        drafted: 96,
        needsReview: 90,
        unmapped: 6,
        failed: 4,
        retried: 7,
      },
      durationMs: 120_000,
      safeFailureClass: 'enrichment_failed',
    })
    const serialized = JSON.stringify(log.mock.calls)
    expect(serialized).not.toMatch(/client|address|description|price|secret|providerResponse/i)
  })
})
