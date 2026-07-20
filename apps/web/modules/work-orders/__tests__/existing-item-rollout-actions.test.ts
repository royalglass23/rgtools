// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertCanManage: vi.fn(),
  getPermissions: vi.fn(),
  acquireRun: vi.fn(),
  queueEligibleItems: vi.fn(),
  recordInitialCounts: vi.fn(),
  resumeFailedRun: vi.fn(),
  refreshStatus: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('../permissions', () => ({
  assertCurrentUserCanManageWorkOrders: mocks.assertCanManage,
  getCurrentWorkOrderPermissions: mocks.getPermissions,
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'manager-1' } })),
}))

vi.mock('../existing-item-rollout-store', () => ({
  createExistingItemRolloutStore: () => ({
    acquireRun: mocks.acquireRun,
    queueEligibleItems: mocks.queueEligibleItems,
    recordInitialCounts: mocks.recordInitialCounts,
    resumeFailedRun: mocks.resumeFailedRun,
    refreshStatus: mocks.refreshStatus,
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  readExistingItemRolloutStatusAction,
  resumeExistingItemRolloutAction,
  startExistingItemRolloutAction,
} from '../existing-item-rollout-actions'

describe('existing-item rollout actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WORK_ORDER_EXISTING_ITEM_ROLLOUT_ENABLED = 'true'
    mocks.getPermissions.mockResolvedValue({ canView: true, canManage: true, canConfigure: false })
  })

  it('rejects a start without Manage access before persistence is reached', async () => {
    mocks.assertCanManage.mockRejectedValueOnce(new Error('Manage Work Order access is required.'))

    await expect(startExistingItemRolloutAction()).rejects.toThrow(
      'Manage Work Order access is required.',
    )
    expect(mocks.acquireRun).not.toHaveBeenCalled()
  })

  it('keeps explicit rollout disabled without touching persisted specifications or jobs', async () => {
    process.env.WORK_ORDER_EXISTING_ITEM_ROLLOUT_ENABLED = 'false'

    await expect(startExistingItemRolloutAction()).rejects.toThrow(
      'Existing-item Production Specification rollout is disabled.',
    )
    expect(mocks.acquireRun).not.toHaveBeenCalled()
  })

  it('starts a correlated rollout for the authenticated Manage user', async () => {
    mocks.acquireRun.mockImplementationOnce(async (input) => ({
      kind: 'created',
      run: {
        id: 'rollout-action-1',
        correlationId: input.correlationId,
        startedAt: input.startedAt,
      },
    }))
    mocks.queueEligibleItems.mockResolvedValueOnce({
      total: 2,
      queued: 2,
      failed: 0,
      skippedRemoved: 1,
      skippedConfirmed: 1,
      skippedCurrentKey: 1,
    })

    const result = await startExistingItemRolloutAction()

    expect(result).toMatchObject({
      id: 'rollout-action-1',
      state: 'running',
      total: 2,
      queued: 2,
    })
    expect(mocks.acquireRun).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'manager-1',
      correlationId: expect.any(String),
      startedAt: expect.any(Date),
    }))
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/work-orders')
  })

  it('resumes a failed run for an authenticated Manage user', async () => {
    mocks.refreshStatus.mockResolvedValueOnce({
      id: 'rollout-action-failed',
      state: 'running',
      queued: 1,
      failed: 0,
      retried: 1,
    })

    const result = await resumeExistingItemRolloutAction('rollout-action-failed')

    expect(mocks.resumeFailedRun).toHaveBeenCalledWith(
      'rollout-action-failed',
      'manager-1',
      expect.any(Date),
    )
    expect(result).toMatchObject({
      id: 'rollout-action-failed',
      state: 'running',
      queued: 1,
      failed: 0,
      retried: 1,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/work-orders')
  })

  it('rejects direct status polling without View access', async () => {
    mocks.getPermissions.mockResolvedValueOnce({
      canView: false,
      canManage: false,
      canConfigure: false,
    })

    await expect(readExistingItemRolloutStatusAction('rollout-private')).rejects.toThrow(
      'View Work Order access is required.',
    )
    expect(mocks.refreshStatus).not.toHaveBeenCalled()
  })

  it('stops direct status polling when rollout execution is disabled', async () => {
    process.env.WORK_ORDER_EXISTING_ITEM_ROLLOUT_ENABLED = 'false'

    await expect(readExistingItemRolloutStatusAction('rollout-disabled')).rejects.toThrow(
      'Existing-item Production Specification rollout is disabled.',
    )
    expect(mocks.refreshStatus).not.toHaveBeenCalled()
  })
})
