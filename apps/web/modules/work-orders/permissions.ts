import { auth } from '@/lib/auth'
import { userCanAccessSlug } from '@/lib/access-db'

export const WORK_ORDER_VIEW_SLUG = 'work-orders'
export const WORK_ORDER_MANAGE_SLUG = 'work-orders/manage'
export const WORK_ORDER_CONFIG_SLUG = 'admin/work-orders'

export type WorkOrderPermissions = {
  canView: boolean
  canManage: boolean
  canConfigure: boolean
}

export async function getCurrentWorkOrderPermissions(): Promise<WorkOrderPermissions> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return { canView: false, canManage: false, canConfigure: false }
  }

  const [canView, canManage, canConfigure] = await Promise.all([
    userCanAccessSlug(userId, WORK_ORDER_VIEW_SLUG),
    userCanAccessSlug(userId, WORK_ORDER_MANAGE_SLUG),
    userCanAccessSlug(userId, WORK_ORDER_CONFIG_SLUG),
  ])

  return {
    canView,
    canManage,
    canConfigure,
  }
}

export async function assertCurrentUserCanManageWorkOrders() {
  const permissions = await getCurrentWorkOrderPermissions()
  if (!permissions.canManage) {
    throw new Error('Forbidden: Work Orders manage access is required.')
  }
}

export async function assertCurrentUserCanConfigureWorkOrders() {
  const permissions = await getCurrentWorkOrderPermissions()
  if (!permissions.canConfigure) {
    throw new Error('Forbidden: Work Orders configuration access is required.')
  }
}
