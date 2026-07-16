import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

const WORK_ORDER_REFRESH_LOCK_NAME = 'work-orders-refresh'
const WORK_ORDER_REFRESH_LEASE_SECONDS = 15 * 60

export type WorkOrderRefreshLock = {
  tryAcquire: () => Promise<boolean>
  release: () => Promise<void>
}

export function createWorkOrderLock(
  lockName: string,
  options: { leaseSeconds?: number; ownerId?: string } = {},
): WorkOrderRefreshLock {
  const ownerId = options.ownerId ?? crypto.randomUUID()
  const leaseSeconds = options.leaseSeconds ?? WORK_ORDER_REFRESH_LEASE_SECONDS

  return {
    async tryAcquire() {
      const acquiredRows = await db.execute(sql`
        INSERT INTO work_order_refresh_locks (lock_name, owner_id, lease_expires_at, updated_at)
        VALUES (
          ${lockName},
          ${ownerId},
          now() + (${leaseSeconds} * INTERVAL '1 second'),
          now()
        )
        ON CONFLICT (lock_name) DO UPDATE
        SET owner_id = EXCLUDED.owner_id,
            lease_expires_at = EXCLUDED.lease_expires_at,
            updated_at = EXCLUDED.updated_at
        WHERE work_order_refresh_locks.lease_expires_at <= now()
        RETURNING lock_name
      `)

      return acquiredRows.rows.length > 0
    },

    async release() {
      await db.execute(sql`
        DELETE FROM work_order_refresh_locks
        WHERE lock_name = ${lockName}
          AND owner_id = ${ownerId}
      `)
    },
  }
}

export function createWorkOrderRefreshLock(): WorkOrderRefreshLock {
  return createWorkOrderLock(WORK_ORDER_REFRESH_LOCK_NAME)
}

export async function acquireWorkOrderRateLimit(
  actionName: string,
  actorId: string,
  windowSeconds = 60,
): Promise<boolean> {
  const lock = createWorkOrderLock(`work-order-rate:${actionName}:${actorId}`, {
    leaseSeconds: windowSeconds,
    ownerId: actorId,
  })
  return lock.tryAcquire()
}

export async function withWorkOrderItemLabelLock<T>(
  itemId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withWorkOrderLock(operation, createWorkOrderLock(`work-order-label:${itemId}`))
}

export async function withWorkOrderRefreshLock<T>(
  operation: () => Promise<T>,
  lock: WorkOrderRefreshLock = createWorkOrderRefreshLock(),
): Promise<T> {
  return withWorkOrderLock(operation, lock)
}

export async function withWorkOrderLock<T>(
  operation: () => Promise<T>,
  lock: WorkOrderRefreshLock,
): Promise<T> {
  const acquired = await lock.tryAcquire()
  if (!acquired) {
    throw new Error('Work Orders operation is already running. Please wait for it to finish before trying again.')
  }

  try {
    return await operation()
  } finally {
    await lock.release()
  }
}
