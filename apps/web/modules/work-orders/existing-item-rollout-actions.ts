'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { auth } from '@/lib/auth'
import {
  getExistingItemRolloutStatus,
  resumeExistingItemRolloutBatch,
  startExistingItemRolloutBatch,
} from './existing-item-rollout'
import { createExistingItemRolloutStore } from './existing-item-rollout-store'
import { emitExistingItemRolloutMetric } from './existing-item-rollout-observability'
import {
  assertCurrentUserCanManageWorkOrders,
  getCurrentWorkOrderPermissions,
} from './permissions'

export async function startExistingItemRolloutAction() {
  await assertCurrentUserCanManageWorkOrders()
  if (process.env.WORK_ORDER_EXISTING_ITEM_ROLLOUT_ENABLED !== 'true') {
    throw new Error('Existing-item Production Specification rollout is disabled.')
  }
  const session = await auth()
  const status = await startExistingItemRolloutBatch({
    store: createExistingItemRolloutStore(),
    actorId: session?.user?.id ?? null,
    correlationId: randomUUID(),
  })
  emitExistingItemRolloutMetric(status)
  revalidatePath('/work-orders')
  return status
}

export async function resumeExistingItemRolloutAction(runId: string) {
  await assertCurrentUserCanManageWorkOrders()
  if (process.env.WORK_ORDER_EXISTING_ITEM_ROLLOUT_ENABLED !== 'true') {
    throw new Error('Existing-item Production Specification rollout is disabled.')
  }
  const session = await auth()
  const status = await resumeExistingItemRolloutBatch({
    store: createExistingItemRolloutStore(),
    runId,
    actorId: session?.user?.id ?? null,
  })
  emitExistingItemRolloutMetric(status)
  revalidatePath('/work-orders')
  return status
}

export async function readExistingItemRolloutStatusAction(runId: string) {
  const permissions = await getCurrentWorkOrderPermissions()
  if (!permissions.canView) throw new Error('View Work Order access is required.')
  if (process.env.WORK_ORDER_EXISTING_ITEM_ROLLOUT_ENABLED !== 'true') {
    throw new Error('Existing-item Production Specification rollout is disabled.')
  }
  const status = await getExistingItemRolloutStatus({
    store: createExistingItemRolloutStore(),
    runId,
  })
  emitExistingItemRolloutMetric(status)
  return status
}
