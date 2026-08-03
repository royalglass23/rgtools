// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAssertCanConfigure = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => vi.fn())
const mockSaveConfig = vi.hoisted(() => vi.fn())
const mockRevalidatePath = vi.hoisted(() => vi.fn())

vi.mock('../permissions', () => ({
  assertCurrentUserCanConfigureWorkOrders: mockAssertCanConfigure,
}))
vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('../specification-filter-config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../specification-filter-config')>()
  return { ...original, saveWorkOrderSpecificationFilterConfig: mockSaveConfig }
})

import { saveWorkOrderSpecificationFilterConfigAction } from '../specification-filter-config-actions'

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertCanConfigure.mockResolvedValue(undefined)
  mockAuth.mockResolvedValue({ user: { id: 'configure-user' } })
  mockSaveConfig.mockResolvedValue(undefined)
})

describe('saveWorkOrderSpecificationFilterConfigAction', () => {
  it('returns an actionable error for ordinary staff without changing global filter configuration', async () => {
    mockAssertCanConfigure.mockRejectedValue(new Error('Forbidden: Work Orders configuration access is required.'))

    await expect(saveWorkOrderSpecificationFilterConfigAction(
      { status: 'idle', message: '' },
      new FormData(),
    )).resolves.toEqual({
      status: 'error',
      message: 'Forbidden: Work Orders configuration access is required.',
    })
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('saves every enabled field in the submitted global order', async () => {
    const formData = new FormData()
    formData.set('enabled:hardwareFinish', 'on')
    formData.set('order:hardwareFinish', '1')
    formData.set('enabled:glassConstruction', 'on')
    formData.set('order:glassConstruction', '2')

    await expect(saveWorkOrderSpecificationFilterConfigAction(
      { status: 'idle', message: '' },
      formData,
    )).resolves.toEqual({
      status: 'success',
      message: 'Production Specification filters saved.',
    })

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.arrayContaining([
        { field: 'hardwareFinish', enabled: true, order: 1 },
        { field: 'glassConstruction', enabled: true, order: 2 },
      ]),
      'configure-user',
    )
    expect(mockSaveConfig.mock.calls[0][0]).toHaveLength(16)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/work-orders')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/work-orders')
  })
})
