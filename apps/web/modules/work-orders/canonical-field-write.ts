import { and, eq } from 'drizzle-orm'
import { isDeepStrictEqual } from 'node:util'
import { db } from '@/lib/db'
import { workOrderEvents, workOrderInstallers, workOrderItems } from '@rgtools/db/schema-workorders'
import { applyFieldPatches } from '@/modules/kanban/field-ownership'
import { validateFieldPatches } from '@/modules/kanban/work-orders'
import { updateActiveWorkOrderItem } from './active-item-write'

export type CanonicalStaffInput = { id: string; field: 'installDate' | 'installerId'; value: string | null; expectedValue: string | null; revision: number }

// The existing Work Orders screen shares canonical manual columns with Kanban.
// Lock value and ownership together, including same-value staff intent.
export async function persistCanonicalStaffField(input: CanonicalStaffInput, actorId: string | null, database: Pick<typeof db, 'transaction'> = db) {
  const patches = validateFieldPatches({ [input.field]: { mode: 'staff', value: input.value } })
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error('Reload this product before saving.')
  return database.transaction(async tx => {
    const [item] = await tx.select().from(workOrderItems).where(eq(workOrderItems.id, input.id)).limit(1).for('update')
    if (!item) throw new Error(`Work Order Item ${input.id} was not found.`)
    if (!item.isActive) throw new Error(`Work Order Item ${input.id} is removed and cannot be edited.`)
    if (item.dashboardRevision !== input.revision || item[input.field] !== input.expectedValue) throw new Error('Someone changed this product. Reload before saving again.')
    if (input.field === 'installerId' && input.value) {
      const [installer] = await tx.select({ id: workOrderInstallers.id }).from(workOrderInstallers).where(and(eq(workOrderInstallers.id, input.value), eq(workOrderInstallers.isActive, true))).limit(1)
      if (!installer) throw new Error(`Installer option ${input.value} does not exist or is inactive.`)
    }
    const next = applyFieldPatches(item.dashboardState, item, patches)
    if (item[input.field] === input.value && isDeepStrictEqual(item.dashboardState, next.dashboardState)) return { workOrderId: item.workOrderId, value: input.value, revision: item.dashboardRevision }
    const revision = item.dashboardRevision + 1
    await updateActiveWorkOrderItem(tx, item.id, { [input.field]: input.value, dashboardState: next.dashboardState, dashboardRevision: revision, updatedAt: new Date() })
    await tx.insert(workOrderEvents).values({ workOrderId: item.workOrderId, workOrderItemId: item.id, actorId,
      fieldName: input.field === 'installerId' ? 'item_installer_changed' : 'item_install_date_changed',
      previousValue: item[input.field], newValue: input.value, isClientVisibleCandidate: false })
    await tx.insert(workOrderEvents).values({ workOrderId: item.workOrderId, workOrderItemId: item.id, actorId,
      fieldName: 'dashboard_field_ownership_updated', previousValue: item.dashboardState, newValue: next.dashboardState, isClientVisibleCandidate: false })
    return { workOrderId: item.workOrderId, value: input.value, revision }
  })
}
