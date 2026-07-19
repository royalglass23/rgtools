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
  createWorkOrderItemProductionSpecificationDraftFromSourceChangeAction,
  ignoreWorkOrderItemProductionSpecificationSourceChangeAction,
  retryWorkOrderItemProductionSpecificationEnrichmentAction,
  saveWorkOrderItemProductionSpecificationDraftAction,
} from '../production-specification-actions'
import { INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE } from '../production-specifications'
import { fingerprintSourceDescription } from '../item-label-lifecycle'

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertCanManage.mockResolvedValue(undefined)
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
  mockLoadCatalogue.mockResolvedValue([...INITIAL_PRODUCTION_SPECIFICATION_CATALOGUE])
})

describe('Production Specification actions', () => {
  it('prevents a view-only user from creating or correcting a draft', async () => {
    mockAssertCanManage.mockRejectedValue(new Error('Forbidden: Work Orders manage access is required.'))

    await expect(saveWorkOrderItemProductionSpecificationDraftAction('item-1', {}, {
      expectedConfirmedRevision: 0,
      expectedDraftRevision: 0,
    })).rejects.toThrow(
      'Forbidden: Work Orders manage access is required.',
    )
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('lets a Manage user save a corrected Needs Review draft without a change reason', async () => {
    const draft = validDraftInput()
    let selection = 0
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              selection += 1
              return selection === 1
                ? [{ id: 'item-1', isActive: true, originalDescription: 'Chrome hardware' }]
                : []
            }),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => [{
              id: 'specification-1',
              status: 'needs_review',
              draftData: draft,
              confirmedRevision: 0,
              draftRevision: 1,
            }]),
          })),
        })),
      })),
    }))

    await expect(saveWorkOrderItemProductionSpecificationDraftAction('item-1', draft, {
      expectedConfirmedRevision: 0,
      expectedDraftRevision: 0,
    })).resolves.toEqual({
      id: 'specification-1',
      status: 'needs_review',
      draftData: draft,
      confirmedRevision: 0,
      draftRevision: 1,
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/work-orders')
  })

  it('returns the safe stale-edit error when another session creates the first draft concurrently', async () => {
    let selection = 0
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              selection += 1
              return selection === 1
                ? [{ id: 'item-1', originalDescription: 'Chrome hardware' }]
                : []
            }),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => []),
          })),
        })),
      })),
    }))

    await expect(saveWorkOrderItemProductionSpecificationDraftAction('item-1', validDraftInput(), {
      expectedConfirmedRevision: 0,
      expectedDraftRevision: 0,
    })).rejects.toThrow('This Production Specification changed in another session. Reload before continuing.')
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
    let selection = 0
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              selection += 1
              return selection === 1
                ? [{ id: 'item-1', isActive: true, originalDescription: 'Custom rail' }]
                : []
            }),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => [{
              id: 'specification-1',
              status: 'needs_review',
              draftData: draft,
              confirmedRevision: 0,
              draftRevision: 1,
            }]),
          })),
        })),
      })),
    }))

    await expect(saveWorkOrderItemProductionSpecificationDraftAction('item-1', draft, {
      expectedConfirmedRevision: 0,
      expectedDraftRevision: 0,
    })).resolves.toEqual({
      id: 'specification-1',
      status: 'needs_review',
      draftData: draft,
      confirmedRevision: 0,
      draftRevision: 1,
    })
  })

  it('does not let a stale draft overwrite a newer confirmed or draft revision', async () => {
    let selection = 0
    const update = vi.fn()
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              selection += 1
              return selection === 1
                ? [{ id: 'item-1', isActive: true, originalDescription: 'Matte Black hardware' }]
                : [{
                    id: 'specification-1',
                    confirmedData: validDraftInput(),
                    confirmedRevision: 2,
                    draftRevision: 5,
                  }]
            }),
          })),
        })),
      })),
      update,
    }))

    await expect(saveWorkOrderItemProductionSpecificationDraftAction('item-1', validDraftInput(), {
      expectedConfirmedRevision: 1,
      expectedDraftRevision: 5,
    })).rejects.toThrow('This Production Specification changed in another session. Reload before continuing.')
    expect(update).not.toHaveBeenCalled()
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
                confirmedRevision: 0,
                draftRevision: 1,
                draftBaseRevision: 0,
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

    await expect(confirmWorkOrderItemProductionSpecificationAction('item-1', {
      expectedConfirmedRevision: 0,
      expectedDraftRevision: 1,
    })).resolves.toEqual({
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

  it('atomically changes Chrome to Matte Black with an approved reason and exact revision identity', async () => {
    const confirmed = validDraftInput()
    const changedDraft = {
      ...confirmed,
      hardwareFinish: { state: 'selected' as const, catalogueId: 'finish.matte-black' },
    }
    const revisionWrites: Array<Record<string, unknown>> = []
    let selection = 0
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              selection += 1
              return selection === 1
                ? [{ id: 'item-1', workOrderId: 'work-order-1', isActive: true }]
                : [{
                    id: 'specification-1',
                    draftData: changedDraft,
                    confirmedData: confirmed,
                    confirmedRevision: 1,
                    draftRevision: 4,
                    draftBaseRevision: 1,
                    sourceDescription: 'Chrome shower hardware',
                    sourceDescriptionFingerprint: 'source-old',
                    draftSourceDescription: 'Chrome shower hardware',
                    draftSourceDescriptionFingerprint: 'source-old',
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
              productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Matte Black | IL Rail 21 x 25 mm | Supply & Install',
              confirmedRevision: 2,
            }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((values: Record<string, unknown>) => {
          revisionWrites.push(values)
          return Promise.resolve([])
        }),
      })),
    }))

    await expect(confirmWorkOrderItemProductionSpecificationAction('item-1', {
      expectedConfirmedRevision: 1,
      expectedDraftRevision: 4,
      changeReason: {
        code: 'client_request',
        note: 'Client approved Matte Black.',
      },
    })).resolves.toEqual({
      status: 'confirmed',
      productionLabel: 'Double Disc | Ext Balcony | 12 mm Toughened Clear | Timber | Matte Black | IL Rail 21 x 25 mm | Supply & Install',
      confirmedRevision: 2,
    })
    expect(revisionWrites).toContainEqual(expect.objectContaining({
      revisionType: 'draft_confirmed',
      reasonCode: 'client_request',
      note: 'Client approved Matte Black.',
      changes: [{
        identity: 'hardwareFinish',
        kind: 'field',
        previousValue: { state: 'selected', catalogueId: 'finish.chrome' },
        newValue: { state: 'selected', catalogueId: 'finish.matte-black' },
      }],
    }))
  })

  it('rejects a stale confirmation without writing history', async () => {
    const insertedValues = vi.fn()
    let selection = 0
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              selection += 1
              return selection === 1
                ? [{ id: 'item-1', workOrderId: 'work-order-1', isActive: true }]
                : [{
                    id: 'specification-1',
                    draftData: validDraftInput(),
                    confirmedData: null,
                    confirmedRevision: 0,
                    draftRevision: 2,
                    draftBaseRevision: 0,
                  }]
            }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => []),
          })),
        })),
      })),
      insert: vi.fn(() => ({ values: insertedValues })),
    }))

    await expect(confirmWorkOrderItemProductionSpecificationAction('item-1', {
      expectedConfirmedRevision: 0,
      expectedDraftRevision: 1,
    })).rejects.toThrow('This Production Specification changed in another session. Reload before continuing.')
    expect(insertedValues).not.toHaveBeenCalled()
  })

  it('audits an explicit decision to ignore the current ServiceM8 source change', async () => {
    const sourceFingerprint = fingerprintSourceDescription('Matte Black source description')
    const writes: Array<{ table: string; values: Record<string, unknown> }> = []
    let selection = 0
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              selection += 1
              return selection === 1
                ? [{
                    id: 'item-1',
                    workOrderId: 'work-order-1',
                    isActive: true,
                    originalDescription: 'Matte Black source description',
                  }]
                : [{
                    id: 'specification-1',
                    confirmedData: validDraftInput(),
                    sourceDescription: 'Chrome source description',
                    sourceDescriptionFingerprint: fingerprintSourceDescription('Chrome source description'),
                    confirmedRevision: 1,
                    draftRevision: 1,
                  }]
            }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: 'specification-1' }]),
          })),
        })),
      })),
      insert: vi.fn((table: Parameters<typeof getTableName>[0]) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          writes.push({ table: getTableName(table), values })
          return Promise.resolve([])
        }),
      })),
    }))

    await expect(ignoreWorkOrderItemProductionSpecificationSourceChangeAction('item-1', {
      expectedConfirmedRevision: 1,
      sourceDescriptionFingerprint: sourceFingerprint,
    })).resolves.toEqual({
      status: 'ignored',
      sourceDescriptionFingerprint: sourceFingerprint,
    })
    expect(writes).toContainEqual(expect.objectContaining({
      table: 'work_order_item_production_specification_revisions',
      values: expect.objectContaining({
        revisionType: 'source_change_ignored',
        actorId: 'user-1',
        note: 'ServiceM8 source change ignored.',
      }),
    }))
  })

  it('creates an audited reviewable draft from changed ServiceM8 source without replacing confirmed truth', async () => {
    const confirmed = validDraftInput()
    const sourceFingerprint = fingerprintSourceDescription('Matte Black source description')
    const writes: Array<{ table: string; values: Record<string, unknown> }> = []
    let selection = 0
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              selection += 1
              return selection === 1
                ? [{
                    id: 'item-1',
                    workOrderId: 'work-order-1',
                    isActive: true,
                    originalDescription: 'Matte Black source description',
                  }]
                : [{
                    id: 'specification-1',
                    confirmedData: confirmed,
                    sourceDescription: 'Chrome source description',
                    sourceDescriptionFingerprint: fingerprintSourceDescription('Chrome source description'),
                    confirmedRevision: 1,
                    draftRevision: 1,
                  }]
            }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [{
              id: 'specification-1',
              status: 'confirmed',
              draftData: confirmed,
              confirmedRevision: 1,
              draftRevision: 2,
            }]),
          })),
        })),
      })),
      insert: vi.fn((table: Parameters<typeof getTableName>[0]) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          writes.push({ table: getTableName(table), values })
          return Promise.resolve([])
        }),
      })),
    }))

    await expect(createWorkOrderItemProductionSpecificationDraftFromSourceChangeAction('item-1', {
      expectedConfirmedRevision: 1,
      expectedDraftRevision: 1,
      sourceDescriptionFingerprint: sourceFingerprint,
    })).resolves.toEqual({
      id: 'specification-1',
      status: 'confirmed',
      draftData: confirmed,
      confirmedRevision: 1,
      draftRevision: 2,
    })
    expect(writes).toContainEqual(expect.objectContaining({
      table: 'work_order_item_production_specification_revisions',
      values: expect.objectContaining({
        revisionType: 'source_change_draft_created',
        actorId: 'user-1',
        previousSnapshot: confirmed,
        newSnapshot: confirmed,
      }),
    }))
  })

  it('does not overwrite an existing draft when handling a changed ServiceM8 source', async () => {
    const update = vi.fn()
    let selection = 0
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              selection += 1
              return selection === 1
                ? [{
                    id: 'item-1',
                    workOrderId: 'work-order-1',
                    originalDescription: 'Matte Black source description',
                  }]
                : [{
                    id: 'specification-1',
                    confirmedData: validDraftInput(),
                    draftData: validDraftInput(),
                    sourceDescription: 'Chrome source description',
                    sourceDescriptionFingerprint: fingerprintSourceDescription('Chrome source description'),
                    confirmedRevision: 1,
                    draftRevision: 2,
                  }]
            }),
          })),
        })),
      })),
      update,
    }))

    await expect(createWorkOrderItemProductionSpecificationDraftFromSourceChangeAction('item-1', {
      expectedConfirmedRevision: 1,
      expectedDraftRevision: 2,
      sourceDescriptionFingerprint: fingerprintSourceDescription('Matte Black source description'),
    })).rejects.toThrow('A Production Specification draft already exists.')
    expect(update).not.toHaveBeenCalled()
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
