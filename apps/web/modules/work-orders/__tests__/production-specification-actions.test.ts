import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTableName } from 'drizzle-orm'

const mockAssertCanManage = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockLoadCatalogue = vi.hoisted(() => vi.fn())

vi.mock('../permissions', () => ({
  assertCurrentUserCanManageWorkOrders: mockAssertCanManage,
}))
vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({ db: { transaction: mockTransaction } }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('../production-specification-catalogue', () => ({
  loadProductionSpecificationCatalogue: mockLoadCatalogue,
}))

import {
  confirmWorkOrderItemProductionSpecificationAction,
  retryWorkOrderItemProductionSpecificationEnrichmentAction,
  saveWorkOrderItemProductionSpecificationDraftAction,
} from '../production-specification-actions'
import { INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE } from '../production-specifications'

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertCanManage.mockResolvedValue(undefined)
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
  mockLoadCatalogue.mockResolvedValue([...INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE])
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

  it('saves a worker draft that uses an active database-only catalogue option', async () => {
    const draft = {
      ...validDraftInput(),
      system: { state: 'selected', catalogueId: 'system.custom-rail' },
    }
    mockLoadCatalogue.mockResolvedValue([
      ...INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE,
      {
        id: 'system.custom-rail',
        field: 'system',
        displayLabel: 'Custom Rail',
        productionLabel: 'Custom Rail',
        aliases: ['custom rail'],
        isActive: true,
      },
    ])
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

  it('retries a stale failed job under the current version and records the actor event', async () => {
    const writes: Array<{ table: string; values: Record<string, unknown> }> = []
    let selection = 0
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => {
                selection += 1
                return selection === 2
                  ? [{
                      id: 'job-stale',
                      sourceDescription: 'Shower glass',
                      extractionSchemaVersion: 0,
                      promptVersion: 'production-specification-v0',
                    }]
                  : []
              }),
            })),
            limit: vi.fn(async () => {
              selection += 1
              return selection === 1
                ? [{
                    id: 'item-1',
                    workOrderId: 'work-order-1',
                    isActive: true,
                    originalDescription: 'Shower glass',
                  }]
                : []
            }),
          })),
        })),
      })),
      insert: vi.fn((table: Parameters<typeof getTableName>[0]) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          const tableName = getTableName(table)
          writes.push({ table: tableName, values })
          if (tableName === 'work_order_item_enrichment_jobs') {
            return {
              onConflictDoNothing: vi.fn(() => ({
                returning: vi.fn(async () => [{ id: 'job-current', status: 'queued' }]),
              })),
            }
          }
          return Promise.resolve([])
        }),
      })),
      update: vi.fn(),
    }))

    await expect(retryWorkOrderItemProductionSpecificationEnrichmentAction('item-1')).resolves.toEqual({
      id: 'job-current',
      status: 'queued',
    })
    expect(writes).toContainEqual(expect.objectContaining({
      table: 'work_order_events',
      values: expect.objectContaining({
        workOrderId: 'work-order-1',
        workOrderItemId: 'item-1',
        actorId: 'user-1',
        fieldName: 'production_specification_enrichment_retried',
      }),
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
