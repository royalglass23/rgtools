'use server'

import { revalidatePath } from 'next/cache'

import { auth } from '@/lib/auth'
import { assertCurrentUserCanConfigureWorkOrders } from './permissions'
import { saveProductionSpecificationCatalogueOption } from './production-specification-catalogue-store'

export type ProductionSpecificationCatalogueActionState = {
  status: 'idle' | 'success' | 'error'
  message: string
}

export async function saveProductionSpecificationCatalogueOptionAction(
  _previousState: ProductionSpecificationCatalogueActionState,
  formData: FormData,
): Promise<ProductionSpecificationCatalogueActionState> {
  try {
    await assertCurrentUserCanConfigureWorkOrders()
    const session = await auth()
    const actorId = session?.user?.id
    if (!actorId) throw new Error('Sign in before changing the Specification Catalogue.')

    const result = await saveProductionSpecificationCatalogueOption({
      actorId,
      editingId: optionalFormText(formData, 'editingId'),
      confirmedImpact: formData.get('confirmImpact') === 'on',
      option: {
        id: formData.get('id'),
        field: formData.get('field'),
        displayLabel: formData.get('displayLabel'),
        productionLabel: formData.get('productionLabel'),
        aliases: String(formData.get('aliases') ?? '')
          .split(/\r?\n/)
          .map((alias) => alias.trim())
          .filter(Boolean),
        psCategorySlug: formData.get('psCategorySlug'),
        psOptionSlug: formData.get('psOptionSlug'),
        ps1Applicable: formData.get('ps1Applicable') === 'on',
        ps3Applicable: formData.get('ps3Applicable') === 'on',
        isActive: formData.get('isActive') === 'on',
        sortOrder: Number(formData.get('sortOrder')),
      },
    })

    revalidatePath('/admin/work-orders')
    revalidatePath('/work-orders')
    const rebuilt = result.rebuiltCount
    return {
      status: 'success',
      message: rebuilt === 0
        ? 'Catalogue option saved.'
        : `Catalogue option saved. ${rebuilt} confirmed ${rebuilt === 1 ? 'item label was' : 'item labels were'} rebuilt with system history.`,
    }
  } catch (error) {
    return { status: 'error', message: catalogueActionErrorMessage(error) }
  }
}

function optionalFormText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim()
  return value || null
}

function catalogueActionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Catalogue option could not be saved.'
  const knownMessage = /^(Forbidden:|Sign in|Catalogue|Aliases?|Alias |Display label|Production Label|PS(?:1|3) |PS[ -]|Glass Construction|The PS Glass type|Sort order|Choose |Confirm |This catalogue|That stable)/
  return knownMessage.test(error.message) ? error.message : 'Catalogue option could not be saved.'
}
