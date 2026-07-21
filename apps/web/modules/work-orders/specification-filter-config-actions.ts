'use server'

import { auth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { assertCurrentUserCanConfigureWorkOrders } from './permissions'
import { PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS } from './production-specifications'
import { saveWorkOrderSpecificationFilterConfig } from './specification-filter-config'

export type WorkOrderSpecificationFilterConfigActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

export async function saveWorkOrderSpecificationFilterConfigAction(
  _previousState: WorkOrderSpecificationFilterConfigActionState,
  formData: FormData,
): Promise<WorkOrderSpecificationFilterConfigActionState> {
  try {
    await assertCurrentUserCanConfigureWorkOrders()
    const session = await auth()

    const fields = PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS
      .map(({ field }, catalogIndex) => {
        const submittedOrder = Number(formData.get(`order:${field}`))
        return {
          field,
          enabled: formData.get(`enabled:${field}`) === 'on',
          order: Number.isFinite(submittedOrder) && submittedOrder > 0
            ? submittedOrder
            : PRODUCTION_SPECIFICATION_FIELD_DEFINITIONS.length + catalogIndex + 1,
        }
      })
      .sort((left, right) => left.order - right.order)
      .map((field, index) => ({ ...field, order: index + 1 }))

    await saveWorkOrderSpecificationFilterConfig(fields, session?.user?.id ?? null)
    revalidatePath('/admin/work-orders')
    revalidatePath('/work-orders')
    return { status: 'success', message: 'Production Specification filters saved.' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error
        ? error.message
        : 'Unable to save Production Specification filters.',
    }
  }
}
