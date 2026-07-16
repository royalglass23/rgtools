import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAssertCanManage = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockRevalidatePath = vi.hoisted(() => vi.fn())

vi.mock('../permissions', () => ({
  assertCurrentUserCanManageWorkOrders: mockAssertCanManage,
}))
vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({ db: { transaction: mockTransaction } }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

import {
  confirmWorkOrderItemProductionSpecificationAction,
  saveWorkOrderItemProductionSpecificationDraftAction,
} from '../production-specification-actions'

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertCanManage.mockResolvedValue(undefined)
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
})

describe('Production Specification actions', () => {
  it('prevents a view-only user from creating or correcting a draft', async () => {
    mockAssertCanManage.mockRejectedValue(new Error('Forbidden: Work Orders manage access is required.'))

    await expect(saveWorkOrderItemProductionSpecificationDraftAction('item-1', {})).rejects.toThrow(
      'Forbidden: Work Orders manage access is required.',
    )
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('lets a Manage user save a corrected Needs Review draft without a change reason', async () => {
    const draft = validDraftInput()
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: 'item-1', isActive: true }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn(async () => [{
              id: 'specification-1',
              status: 'needs_review',
              draftData: draft,
            }]),
          })),
        })),
      })),
    }))

    await expect(saveWorkOrderItemProductionSpecificationDraftAction('item-1', draft)).resolves.toEqual({
      id: 'specification-1',
      status: 'needs_review',
      draftData: draft,
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/work-orders')
  })

  it('atomically confirms the draft and records its first immutable baseline and item event', async () => {
    const draft = validDraftInput()
    const insertedValues = vi.fn(async () => [])
    let selection = 0
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              selection += 1
              if (selection === 1) return [{ id: 'item-1', workOrderId: 'work-order-1', isActive: true }]
              return [{
                id: 'specification-1',
                draftData: draft,
                confirmedData: null,
              }]
            }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [{
              status: 'confirmed',
              productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Chrome | IL Rail 21 x 25 mm | Supply & Install',
            }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({ values: insertedValues })),
    }))

    await expect(confirmWorkOrderItemProductionSpecificationAction('item-1')).resolves.toEqual({
      status: 'confirmed',
      productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Chrome | IL Rail 21 x 25 mm | Supply & Install',
    })
    expect(insertedValues).toHaveBeenCalledWith(expect.objectContaining({
      workOrderItemId: 'item-1',
      actorId: 'user-1',
      revisionType: 'baseline_confirmed',
      previousSnapshot: null,
      newSnapshot: draft,
      reasonCode: null,
    }))
    expect(insertedValues).toHaveBeenCalledWith(expect.objectContaining({
      workOrderId: 'work-order-1',
      workOrderItemId: 'item-1',
      actorId: 'user-1',
      fieldName: 'production_specification_confirmed',
    }))
  })
})

function validDraftInput() {
  return {
    schemaVersion: 1,
    system: { state: 'selected', catalogueId: 'system.double-disc' },
    structureMaterial: { state: 'selected', catalogueId: 'structure_material.timber' },
    structureType: { state: 'selected', catalogueId: 'structure_type.balcony' },
    locationEnvironment: { state: 'selected', catalogueId: 'location.external' },
    locationDetail: { state: 'tbc' },
    structureBuilt: { state: 'selected', catalogueId: 'structure_built.new' },
    glassConstruction: { state: 'selected', catalogueId: 'glass_construction.toughened' },
    glassAppearance: { state: 'selected', catalogueId: 'glass_appearance.clear' },
    thickness: { state: 'selected', catalogueId: 'thickness.12mm' },
    gateRequired: { state: 'selected', catalogueId: 'gate_required.no' },
    doorOpeningType: { state: 'tbc' },
    fixingMethod: { state: 'selected', catalogueId: 'fixing_method.double-disc' },
    hardwareFinish: { state: 'selected', catalogueId: 'finish.chrome' },
    systemFinish: { state: 'tbc' },
    interlinkingRail: { state: 'selected', catalogueId: 'interlinking_rail.21x25mm' },
    deliveryScope: { state: 'selected', catalogueId: 'delivery_scope.supply-install' },
    measurements: [],
    additionalComponents: [],
    specialRequirements: [],
  }
}
