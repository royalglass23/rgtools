// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAssertCanConfigure = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => vi.fn())
const mockSaveCatalogueOption = vi.hoisted(() => vi.fn())
const mockRevalidatePath = vi.hoisted(() => vi.fn())

vi.mock('../permissions', () => ({
  assertCurrentUserCanConfigureWorkOrders: mockAssertCanConfigure,
}))
vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('../production-specification-catalogue-store', () => ({
  saveProductionSpecificationCatalogueOption: mockSaveCatalogueOption,
}))

import { saveProductionSpecificationCatalogueOptionAction } from '../production-specification-catalogue-actions'

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertCanConfigure.mockResolvedValue(undefined)
  mockAuth.mockResolvedValue({ user: { id: 'configure-user' } })
  mockSaveCatalogueOption.mockResolvedValue({ affectedCount: 2, rebuiltCount: 2 })
})

describe('Specification Catalogue actions', () => {
  it('rejects Manage-only users before any catalogue mutation', async () => {
    mockAssertCanConfigure.mockRejectedValue(new Error('Forbidden: Work Orders configuration access is required.'))

    const state = await saveProductionSpecificationCatalogueOptionAction(
      { status: 'idle', message: '' },
      catalogueFormData(),
    )

    expect(state).toEqual({
      status: 'error',
      message: 'Forbidden: Work Orders configuration access is required.',
    })
    expect(mockSaveCatalogueOption).not.toHaveBeenCalled()
  })

  it('passes normalized governance input and explicit impact confirmation to the store', async () => {
    const formData = catalogueFormData()
    formData.set('aliases', 'polished chrome\n bright chrome ')
    formData.set('ps1Applicable', 'on')
    formData.set('confirmImpact', 'on')

    await expect(saveProductionSpecificationCatalogueOptionAction(
      { status: 'idle', message: '' },
      formData,
    )).resolves.toEqual({
      status: 'success',
      message: 'Catalogue option saved. 2 confirmed item labels were rebuilt with system history.',
    })

    expect(mockSaveCatalogueOption).toHaveBeenCalledWith({
      actorId: 'configure-user',
      editingId: 'finish.chrome',
      confirmedImpact: true,
      option: {
        id: 'finish.chrome',
        field: 'hardwareFinish',
        displayLabel: 'Chrome',
        productionLabel: 'Chrome',
        aliases: ['polished chrome', 'bright chrome'],
        psCategorySlug: 'finish',
        psOptionSlug: 'chrome',
        ps1Applicable: true,
        ps3Applicable: false,
        isActive: true,
        sortOrder: 10,
      },
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/work-orders')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/work-orders')
  })

  it('does not claim labels were rebuilt for a non-wording catalogue change', async () => {
    mockSaveCatalogueOption.mockResolvedValueOnce({ affectedCount: 2, rebuiltCount: 0 })

    await expect(saveProductionSpecificationCatalogueOptionAction(
      { status: 'idle', message: '' },
      catalogueFormData(),
    )).resolves.toEqual({
      status: 'success',
      message: 'Catalogue option saved.',
    })
  })

  it('returns actionable published PS mapping validation errors', async () => {
    mockSaveCatalogueOption.mockRejectedValueOnce(new Error(
      'PS1 mapping glass_type.unknown is not present in the published PS Generator configuration.',
    ))

    await expect(saveProductionSpecificationCatalogueOptionAction(
      { status: 'idle', message: '' },
      catalogueFormData(),
    )).resolves.toEqual({
      status: 'error',
      message: 'PS1 mapping glass_type.unknown is not present in the published PS Generator configuration.',
    })
  })

  it.each([
    'PS-applicable options require both a PS category and PS option slug.',
    'PS mapping glass_type.toughened is already used by Toughened.',
  ])('returns actionable catalogue validation error: %s', async (message) => {
    mockSaveCatalogueOption.mockRejectedValueOnce(new Error(message))

    await expect(saveProductionSpecificationCatalogueOptionAction(
      { status: 'idle', message: '' },
      catalogueFormData(),
    )).resolves.toEqual({ status: 'error', message })
  })
})

function catalogueFormData() {
  const formData = new FormData()
  formData.set('editingId', 'finish.chrome')
  formData.set('id', 'finish.chrome')
  formData.set('field', 'hardwareFinish')
  formData.set('displayLabel', 'Chrome')
  formData.set('productionLabel', 'Chrome')
  formData.set('aliases', '')
  formData.set('psCategorySlug', 'finish')
  formData.set('psOptionSlug', 'chrome')
  formData.set('isActive', 'on')
  formData.set('sortOrder', '10')
  return formData
}
