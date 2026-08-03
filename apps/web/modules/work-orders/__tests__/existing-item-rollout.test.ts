// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  startExistingItemRolloutBatch,
  type ExistingItemRolloutStore,
} from '../existing-item-rollout'

describe('supervised existing-item Production Specification rollout', () => {
  it('starts only after an explicit invocation and exposes the initial running counts', async () => {
    let acquireCalls = 0
    let queueCalls = 0
    const store: ExistingItemRolloutStore = {
      acquireRun: async (input) => {
        acquireCalls += 1
        return {
          kind: 'created',
          run: {
            id: 'rollout-1',
            correlationId: input.correlationId,
            startedAt: input.startedAt,
          },
        }
      },
      queueEligibleItems: async (runId) => {
        queueCalls += 1
        expect(runId).toBe('rollout-1')
        return {
          total: 4,
          queued: 4,
          failed: 0,
          skippedRemoved: 2,
          skippedConfirmed: 1,
          skippedCurrentKey: 3,
        }
      },
      recordInitialCounts: async () => undefined,
    }

    expect({ acquireCalls, queueCalls }).toEqual({ acquireCalls: 0, queueCalls: 0 })

    const status = await startExistingItemRolloutBatch({
      store,
      actorId: 'manager-1',
      correlationId: 'rollout-correlation-1',
      now: () => new Date('2026-07-20T02:00:00.000Z'),
    })

    expect(status).toEqual({
      id: 'rollout-1',
      correlationId: 'rollout-correlation-1',
      state: 'running',
      total: 4,
      queued: 4,
      processing: 0,
      drafted: 0,
      needsReview: 0,
      unmapped: 0,
      failed: 0,
      retried: 0,
      skippedRemoved: 2,
      skippedConfirmed: 1,
      skippedCurrentKey: 3,
      startedAt: new Date('2026-07-20T02:00:00.000Z'),
      completedAt: null,
      durationMs: 0,
      safeFailureClass: null,
    })
    expect({ acquireCalls, queueCalls }).toEqual({ acquireCalls: 1, queueCalls: 1 })
  })

  it('returns the active run without queueing a concurrent duplicate start', async () => {
    let queueCalls = 0
    const activeStatus = {
      id: 'rollout-active',
      correlationId: 'existing-correlation',
      state: 'running' as const,
      total: 100,
      queued: 70,
      processing: 5,
      drafted: 20,
      needsReview: 18,
      unmapped: 2,
      failed: 3,
      retried: 4,
      skippedRemoved: 6,
      skippedConfirmed: 8,
      skippedCurrentKey: 12,
      startedAt: new Date('2026-07-20T01:00:00.000Z'),
      completedAt: null,
      durationMs: 3_600_000,
      safeFailureClass: null,
    }
    const store: ExistingItemRolloutStore = {
      acquireRun: async () => ({ kind: 'existing', status: activeStatus }),
      queueEligibleItems: async () => {
        queueCalls += 1
        throw new Error('A duplicate start must not queue items.')
      },
      recordInitialCounts: async () => undefined,
    }

    const result = await startExistingItemRolloutBatch({
      store,
      actorId: 'manager-2',
      correlationId: 'ignored-new-correlation',
    })

    expect(result).toEqual(activeStatus)
    expect(queueCalls).toBe(0)
  })
})
