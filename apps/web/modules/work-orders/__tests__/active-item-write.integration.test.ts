// @vitest-environment node

import { Pool, neonConfig } from '@neondatabase/serverless'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as coreSchema from '@rgtools/db/schema'
import * as workOrderSchema from '@rgtools/db/schema-workorders'
import { workOrderItems, workOrders } from '@rgtools/db/schema-workorders'
import { verifyWorkOrderAcceptanceDatabase } from '@/tests/e2e/work-order-acceptance-safety'
import { updateActiveWorkOrderItem } from '../active-item-write'

const isolatedDatabaseUrl = process.env.E2E_DATABASE_URL
const expectedDatabaseSentinel = process.env.E2E_DATABASE_SENTINEL
const describeWithIsolatedDatabase = isolatedDatabaseUrl ? describe : describe.skip
const workOrderId = crypto.randomUUID()
const workOrderItemId = crypto.randomUUID()
const identityValue = `active-write-race-${crypto.randomUUID()}`

describeWithIsolatedDatabase('active Work Order Item write integration', () => {
  let pool: Pool | undefined
  let database: ReturnType<typeof createDatabase>['database'] | undefined

  beforeAll(async () => {
    if (!isolatedDatabaseUrl) return
    neonConfig.webSocketConstructor = globalThis.WebSocket
    const connection = createDatabase(isolatedDatabaseUrl)
    pool = connection.pool
    database = connection.database

    await verifyWorkOrderAcceptanceDatabase({
      expectedSentinel: expectedDatabaseSentinel,
      readProof: async () => {
        const proof = await pool?.query<{ databaseName: string; sentinel: string | null }>(`
          SELECT
            current_database() AS "databaseName",
            current_setting('rgtools.e2e_database_sentinel', true) AS sentinel
        `)
        return proof?.rows[0] ?? { databaseName: 'unknown', sentinel: null }
      },
    })

    await database.insert(workOrders).values({
      id: workOrderId,
      identityKind: 'servicem8_uuid',
      identityValue,
      servicem8Status: 'Work Order',
      clientName: 'Active write race test',
    })
    await database.insert(workOrderItems).values({
      id: workOrderItemId,
      workOrderId,
      servicem8ItemUuid: `item-${identityValue}`,
      servicem8JobUuid: `job-${identityValue}`,
      quantity: '1',
      originalDescription: 'Race-controlled Work Order Item',
      generatedLabel: 'Original label',
      labelStatus: 'generated',
      isActive: true,
    })
  })

  afterAll(async () => {
    if (database) await database.delete(workOrders).where(eq(workOrders.id, workOrderId))
    if (pool) await pool.end()
  })

  it('rejects the write when refresh commits removal after the transaction reads active state', async () => {
    if (!database) throw new Error('The isolated Work Orders integration database was not created.')

    let reportActiveRead = () => {}
    let continueAfterRemoval = () => {}
    const activeStateRead = new Promise<void>((resolve) => { reportActiveRead = resolve })
    const removalCommitted = new Promise<void>((resolve) => { continueAfterRemoval = resolve })

    const mutation = database.transaction(async (tx) => {
      const [selectedItem] = await tx
        .select({ isActive: workOrderItems.isActive })
        .from(workOrderItems)
        .where(eq(workOrderItems.id, workOrderItemId))
        .limit(1)

      expect(selectedItem?.isActive).toBe(true)
      reportActiveRead()
      await removalCommitted

      await updateActiveWorkOrderItem(tx, workOrderItemId, {
        manualLabelOverride: 'Too-late label',
        labelStatus: 'manual',
        updatedAt: new Date(),
      })
    })

    await activeStateRead
    try {
      await database
        .update(workOrderItems)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(workOrderItems.id, workOrderItemId), eq(workOrderItems.isActive, true)))
    } finally {
      continueAfterRemoval()
    }

    await expect(mutation).rejects.toThrow(
      `Work Order Item ${workOrderItemId} is removed and cannot be edited.`,
    )

    const [persistedItem] = await database
      .select({ isActive: workOrderItems.isActive, manualLabelOverride: workOrderItems.manualLabelOverride })
      .from(workOrderItems)
      .where(eq(workOrderItems.id, workOrderItemId))
      .limit(1)
    expect(persistedItem).toEqual({ isActive: false, manualLabelOverride: null })
  })
})

function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString })
  const database = drizzle(pool, { schema: { ...coreSchema, ...workOrderSchema } })
  return { pool, database }
}
