import { and, eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { workOrderItems } from '@rgtools/db/schema-workorders'

type ActiveWorkOrderItemDatabase = Pick<typeof db, 'update'>
type ActiveWorkOrderItemChanges = Partial<Omit<
  typeof workOrderItems.$inferInsert,
  'id' | 'workOrderId' | 'servicem8ItemUuid' | 'servicem8JobUuid' | 'isActive'
>>

export async function updateActiveWorkOrderItem(
  database: ActiveWorkOrderItemDatabase,
  itemId: string,
  changes: ActiveWorkOrderItemChanges,
) {
  const [updatedItem] = await database
    .update(workOrderItems)
    .set(changes)
    .where(and(eq(workOrderItems.id, itemId), eq(workOrderItems.isActive, true)))
    .returning({ id: workOrderItems.id })

  if (!updatedItem) throw new Error(`Work Order Item ${itemId} is removed and cannot be edited.`)
}
