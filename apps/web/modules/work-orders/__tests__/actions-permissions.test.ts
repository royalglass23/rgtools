import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAssertCanManage = vi.hoisted(() => vi.fn())
const mockAssertCanConfigure = vi.hoisted(() => vi.fn())
const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn())
const mockInsert = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockDelete = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => vi.fn())
const mockLogAudit = vi.hoisted(() => vi.fn())
const mockGenerateWorkOrderItemLabel = vi.hoisted(() => vi.fn())
const mockGetWorkOrderSummaryConfig = vi.hoisted(() => vi.fn())

vi.mock('../permissions', () => ({
  assertCurrentUserCanConfigureWorkOrders: mockAssertCanConfigure,
  assertCurrentUserCanManageWorkOrders: mockAssertCanManage,
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
    delete: mockDelete,
    transaction: mockTransaction,
  },
}))
vi.mock('@/lib/audit-db', () => ({ logAudit: mockLogAudit }))
vi.mock('@/lib/servicem8/client', () => ({
  createServiceM8RequestFromEnv: vi.fn(),
}))
vi.mock('../item-labels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../item-labels')>()
  return {
    ...actual,
    generateWorkOrderItemLabel: mockGenerateWorkOrderItemLabel,
  }
})
vi.mock('../summary-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../summary-config')>()
  return {
    ...actual,
    getWorkOrderSummaryConfig: mockGetWorkOrderSummaryConfig,
  }
})

import {
  addWorkOrderTimelineNoteAction,
  batchDeleteWorkOrdersAction,
  createWorkOrderInstallerAction,
  deactivateWorkOrderInstallerAction,
  generateWorkOrderAiSuggestionAction,
  markWorkOrderEventClientVisibleCandidateAction,
  refreshWorkOrdersAction,
  refreshWorkOrdersFromServiceM8,
  regenerateWorkOrderItemLabelAction,
  saveWorkOrderBillingExclusionsAction,
  saveWorkOrderSummaryConfigAction,
  updateWorkOrderItemOperationalFieldAction,
  updateWorkOrderItemLabelAction,
} from '../actions'

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertCanManage.mockResolvedValue(undefined)
  mockAssertCanConfigure.mockResolvedValue(undefined)
  mockUpdate.mockReturnValue({
    set: vi.fn(() => ({
      where: vi.fn(async () => []),
    })),
  })
  mockSelect.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => [{
          installerId: null,
          stageOptionId: null,
          hardwareStatusOptionId: null,
          maintenanceProgram: false,
          installDate: null,
          dateCompleted: null,
          riskLevelOverride: null,
          importanceOverride: null,
        }]),
      })),
    })),
  })
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
  mockGenerateWorkOrderItemLabel.mockResolvedValue('Regenerated production label')
  mockGetWorkOrderSummaryConfig.mockResolvedValue([
    'item',
    'installer',
    'stage',
    'hardware',
    'maintenanceProgram',
    'installDate',
    'dateCompleted',
    'risk',
    'importance',
  ].map((id, index) => ({ id, editable: true, visible: true, filterable: false, order: index + 1 })))
  mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => callback({
    delete: mockDelete,
  }))
  mockDelete.mockReturnValue({
    where: vi.fn(async () => []),
  })
})

describe('work order action permissions', () => {
  it('requires manage access before refreshing Work Orders from ServiceM8', async () => {
    mockAssertCanManage.mockRejectedValue(new Error('Forbidden: Work Orders manage access is required.'))

    await expect(refreshWorkOrdersAction()).rejects.toThrow('Forbidden: Work Orders manage access is required.')
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('requires manage access at the directly callable full-refresh boundary', async () => {
    mockAssertCanManage.mockRejectedValue(new Error('Forbidden: Work Orders manage access is required.'))
    const request = vi.fn()

    await expect(refreshWorkOrdersFromServiceM8(request)).rejects.toThrow(
      'Forbidden: Work Orders manage access is required.',
    )
    expect(request).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('requires manage access before updating an operational Work Order Item field', async () => {
    mockAssertCanManage.mockRejectedValue(new Error('Forbidden: Work Orders manage access is required.'))

    await expect(updateWorkOrderItemOperationalFieldAction('item-1', 'risk', 'high')).rejects.toThrow(
      'Forbidden: Work Orders manage access is required.',
    )
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('updates one Work Order Item field and records its item-level audit event', async () => {
    const returning = vi.fn(async () => [{ id: 'item-1' }])
    const updateSet = vi.fn(() => ({ where: vi.fn(() => ({ returning })) }))
    const insertValues = vi.fn(async () => [])
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: 'item-1',
              workOrderId: 'work-order-1',
              isActive: true,
              installerId: '11111111-1111-4111-8111-111111111111',
            }]),
          })),
        })),
      })),
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: insertValues })),
    }))

    await updateWorkOrderItemOperationalFieldAction(
      'item-1',
      'installer',
      '22222222-2222-4222-8222-222222222222',
    )

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      installerId: '22222222-2222-4222-8222-222222222222',
      updatedAt: expect.any(Date),
    }))
    expect(updateSet).not.toHaveBeenCalledWith(expect.objectContaining({
      stageOptionId: expect.anything(),
    }))
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      workOrderId: 'work-order-1',
      workOrderItemId: 'item-1',
      actorId: 'user-1',
      fieldName: 'item_installer_changed',
      previousValue: '11111111-1111-4111-8111-111111111111',
      newValue: '22222222-2222-4222-8222-222222222222',
      isClientVisibleCandidate: false,
    }))
  })

  it('rejects an operational edit when refresh removes the item between read and write', async () => {
    const returning = vi.fn(async () => [])
    const insertValues = vi.fn(async () => [])
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: 'item-1',
              workOrderId: 'work-order-1',
              isActive: true,
              riskLevelOverride: null,
            }]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
    }))

    await expect(updateWorkOrderItemOperationalFieldAction('item-1', 'risk', 'high')).rejects.toThrow(
      'Work Order Item item-1 is removed and cannot be edited.',
    )

    expect(returning).toHaveBeenCalledOnce()
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('rejects an installer ID that does not identify an active configured option', async () => {
    const updateSet = vi.fn(() => ({ where: vi.fn(async () => []) }))
    const insertValues = vi.fn(async () => [])
    const select = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: 'item-1',
              workOrderId: 'work-order-1',
              isActive: true,
              installerId: null,
            }]),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
        })),
      })
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback({
      select,
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: insertValues })),
    }))

    await expect(updateWorkOrderItemOperationalFieldAction(
      'item-1',
      'installer',
      '22222222-2222-4222-8222-222222222222',
    )).rejects.toThrow(
      'Installer option 22222222-2222-4222-8222-222222222222 does not exist or is inactive.',
    )

    expect(updateSet).not.toHaveBeenCalled()
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('rejects a stage ID that does not identify an active configured option', async () => {
    const updateSet = vi.fn(() => ({ where: vi.fn(async () => []) }))
    const insertValues = vi.fn(async () => [])
    const select = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: 'item-1',
              workOrderId: 'work-order-1',
              isActive: true,
              stageOptionId: null,
            }]),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
        })),
      })
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback({
      select,
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: insertValues })),
    }))

    await expect(updateWorkOrderItemOperationalFieldAction(
      'item-1',
      'stage',
      '33333333-3333-4333-8333-333333333333',
    )).rejects.toThrow(
      'Stage option 33333333-3333-4333-8333-333333333333 does not exist or is inactive.',
    )

    expect(updateSet).not.toHaveBeenCalled()
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('rejects a hardware ID that does not identify an active configured option', async () => {
    const updateSet = vi.fn(() => ({ where: vi.fn(async () => []) }))
    const insertValues = vi.fn(async () => [])
    const select = vi.fn()
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: 'item-1',
              workOrderId: 'work-order-1',
              isActive: true,
              hardwareStatusOptionId: null,
            }]),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
        })),
      })
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback({
      select,
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(() => ({ values: insertValues })),
    }))

    await expect(updateWorkOrderItemOperationalFieldAction(
      'item-1',
      'hardware',
      '44444444-4444-4444-8444-444444444444',
    )).rejects.toThrow(
      'Hardware option 44444444-4444-4444-8444-444444444444 does not exist or is inactive.',
    )

    expect(updateSet).not.toHaveBeenCalled()
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('rejects an invalid Work Order Item date before starting a write transaction', async () => {
    await expect(
      updateWorkOrderItemOperationalFieldAction('item-1', 'installDate', '14/07/2026'),
    ).rejects.toThrow('Install date must use YYYY-MM-DD.')

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects a forged Work Order Item field name before starting a write transaction', async () => {
    await expect(
      updateWorkOrderItemOperationalFieldAction(
        'item-1',
        'clientName' as never,
        null,
      ),
    ).rejects.toThrow('Work Order Item field clientName cannot be edited.')

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects an operational edit when summary configuration disables that field', async () => {
    mockGetWorkOrderSummaryConfig.mockResolvedValueOnce([
      { id: 'risk', label: 'Risk', editable: false },
    ])

    await expect(
      updateWorkOrderItemOperationalFieldAction('item-1', 'risk', 'high'),
    ).rejects.toThrow('Risk editing is disabled in Work Order Summary Configuration.')

    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('lets an authorised user replace only the Work Order Item short label', async () => {
    const returning = vi.fn(async () => [{ id: 'item-1' }])
    const set = vi.fn(() => ({ where: vi.fn(() => ({ returning })) }))
    const insertValues = vi.fn(async () => [])
    const transactionDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: 'item-1',
              workOrderId: 'work-order-1',
              originalDescription: 'Immutable ServiceM8 source description',
              generatedLabel: 'Generated label',
              manualLabelOverride: null,
              isActive: true,
            }]),
          })),
        })),
      })),
      update: vi.fn(() => ({ set })),
      insert: vi.fn(() => ({ values: insertValues })),
    }
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback(transactionDb))
    const formData = new FormData()
    formData.set('label', 'Staff corrected label')

    await updateWorkOrderItemLabelAction('item-1', formData)

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      manualLabelOverride: 'Staff corrected label',
      labelStatus: 'manual',
      sourceDescriptionFingerprint: expect.any(String),
    }))
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({
      originalDescription: expect.anything(),
      itemCode: expect.anything(),
      quantity: expect.anything(),
    }))
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      workOrderId: 'work-order-1',
      workOrderItemId: 'item-1',
      actorId: 'user-1',
      fieldName: 'item_label_manually_updated',
      previousValue: 'Generated label',
      newValue: 'Staff corrected label',
      isClientVisibleCandidate: false,
    }))
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'user-1',
      entityType: 'work_order_item',
      action: 'work_order_item.label_manually_updated',
      targetId: 'item-1',
    }), transactionDb)
  })

  it('rejects a manual label change for a removed Work Order Item', async () => {
    const txUpdate = vi.fn()
    const txInsert = vi.fn()
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: 'item-1',
              workOrderId: 'work-order-1',
              originalDescription: 'Archived ServiceM8 description',
              generatedLabel: 'Archived label',
              manualLabelOverride: null,
              isActive: false,
            }]),
          })),
        })),
      })),
      update: txUpdate,
      insert: txInsert,
    }))
    const formData = new FormData()
    formData.set('label', 'Forged archived label')

    await expect(updateWorkOrderItemLabelAction('item-1', formData)).rejects.toThrow(
      'Work Order Item item-1 is removed and cannot be edited.',
    )

    expect(txUpdate).not.toHaveBeenCalled()
    expect(txInsert).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('rejects a manual label change when refresh removes the item between read and write', async () => {
    const returning = vi.fn(async () => [])
    const where = vi.fn(() => ({ returning }))
    const insertValues = vi.fn(async () => [])
    const transactionDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{
              id: 'item-1',
              workOrderId: 'work-order-1',
              originalDescription: 'Current ServiceM8 description',
              generatedLabel: 'Current label',
              manualLabelOverride: null,
              isActive: true,
            }]),
          })),
        })),
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where })) })),
      insert: vi.fn(() => ({ values: insertValues })),
    }
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback(transactionDb))
    const formData = new FormData()
    formData.set('label', 'Too-late label')

    await expect(updateWorkOrderItemLabelAction('item-1', formData)).rejects.toThrow(
      'Work Order Item item-1 is removed and cannot be edited.',
    )

    expect(returning).toHaveBeenCalledOnce()
    expect(insertValues).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('requires manage access before manually changing a Work Order Item label', async () => {
    mockAssertCanManage.mockRejectedValue(new Error('Forbidden: Work Orders manage access is required.'))
    const formData = new FormData()
    formData.set('label', 'Unauthorised label')

    await expect(updateWorkOrderItemLabelAction('item-1', formData)).rejects.toThrow(
      'Forbidden: Work Orders manage access is required.',
    )

    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects a short-label edit when Item is configured read-only', async () => {
    mockGetWorkOrderSummaryConfig.mockResolvedValueOnce([
      { id: 'item', label: 'Item', editable: false },
    ])
    const formData = new FormData()
    formData.set('label', 'Blocked configured label')

    await expect(updateWorkOrderItemLabelAction('item-1', formData)).rejects.toThrow(
      'Item editing is disabled in Work Order Summary Configuration.',
    )

    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects an empty manual label before reading or changing the item', async () => {
    const formData = new FormData()
    formData.set('label', '   ')

    await expect(updateWorkOrderItemLabelAction('item-1', formData)).rejects.toThrow(
      'Work Order Item label is required.',
    )

    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('deliberately replaces a manual label when an authorised user regenerates with AI', async () => {
    const returning = vi.fn(async () => [{ id: 'item-1' }])
    const set = vi.fn(() => ({ where: vi.fn(() => ({ returning })) }))
    const insertValues = vi.fn(async () => [])
    const activeItem = {
      id: 'item-1',
      workOrderId: 'work-order-1',
      originalDescription: 'Current immutable ServiceM8 description',
      generatedLabel: 'Old generated label',
      manualLabelOverride: 'Staff-approved label',
      isActive: true,
    }
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [activeItem]),
        })),
      })),
    })
    const transactionDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => [activeItem]) })),
        })),
      })),
      update: vi.fn(() => ({ set })),
      insert: vi.fn(() => ({ values: insertValues })),
    }
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback(transactionDb))

    await regenerateWorkOrderItemLabelAction('item-1')

    expect(mockGenerateWorkOrderItemLabel).toHaveBeenCalledWith('Current immutable ServiceM8 description')
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      generatedLabel: 'Regenerated production label',
      manualLabelOverride: null,
      labelStatus: 'generated',
      sourceDescriptionFingerprint: expect.any(String),
    }))
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      workOrderId: 'work-order-1',
      workOrderItemId: 'item-1',
      actorId: 'user-1',
      fieldName: 'item_label_regenerated',
      previousValue: 'Staff-approved label',
      newValue: 'Regenerated production label',
      isClientVisibleCandidate: false,
    }))
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'work_order_item.label_regenerated',
      detail: expect.objectContaining({
        previousLabel: 'Staff-approved label',
        newLabel: 'Regenerated production label',
      }),
    }), transactionDb)
  })

  it('rejects AI label regeneration for a removed Work Order Item before calling OpenAI', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{
            id: 'item-1',
            workOrderId: 'work-order-1',
            originalDescription: 'Archived ServiceM8 description',
            generatedLabel: 'Archived label',
            manualLabelOverride: null,
            isActive: false,
          }]),
        })),
      })),
    })

    await expect(regenerateWorkOrderItemLabelAction('item-1')).rejects.toThrow(
      'Work Order Item item-1 is removed and cannot be edited.',
    )

    expect(mockGenerateWorkOrderItemLabel).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects AI label regeneration when the Work Order Item is removed during generation', async () => {
    const initialItem = {
      id: 'item-1',
      workOrderId: 'work-order-1',
      originalDescription: 'Current ServiceM8 description',
      generatedLabel: 'Current label',
      manualLabelOverride: null,
      isActive: true,
    }
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => [initialItem]) })),
      })),
    })
    const update = vi.fn()
    const insert = vi.fn()
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => [{ ...initialItem, isActive: false }]) })),
        })),
      })),
      update,
      insert,
    }))

    await expect(regenerateWorkOrderItemLabelAction('item-1')).rejects.toThrow(
      'Work Order Item item-1 is removed and cannot be edited.',
    )

    expect(mockGenerateWorkOrderItemLabel).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects AI label regeneration when refresh removes the item between transaction read and write', async () => {
    const activeItem = {
      id: 'item-1',
      workOrderId: 'work-order-1',
      originalDescription: 'Current ServiceM8 description',
      generatedLabel: 'Current label',
      manualLabelOverride: null,
      isActive: true,
    }
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => [activeItem]) })),
      })),
    })
    const returning = vi.fn(async () => [])
    const insertValues = vi.fn(async () => [])
    const transactionDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => [activeItem]) })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
    }
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<void>) => callback(transactionDb))

    await expect(regenerateWorkOrderItemLabelAction('item-1')).rejects.toThrow(
      'Work Order Item item-1 is removed and cannot be edited.',
    )

    expect(mockGenerateWorkOrderItemLabel).toHaveBeenCalledOnce()
    expect(returning).toHaveBeenCalledOnce()
    expect(insertValues).not.toHaveBeenCalled()
    expect(mockLogAudit).not.toHaveBeenCalled()
  })

  it('requires manage access before regenerating a Work Order Item label', async () => {
    mockAssertCanManage.mockRejectedValue(new Error('Forbidden: Work Orders manage access is required.'))

    await expect(regenerateWorkOrderItemLabelAction('item-1')).rejects.toThrow(
      'Forbidden: Work Orders manage access is required.',
    )

    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockGenerateWorkOrderItemLabel).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('requires manage access before bulk deleting Work Orders', async () => {
    mockAssertCanManage.mockRejectedValue(new Error('Forbidden: Work Orders manage access is required.'))
    const formData = new FormData()
    formData.append('workOrderId', 'work-order-1')

    await expect(batchDeleteWorkOrdersAction(formData)).rejects.toThrow(
      'Forbidden: Work Orders manage access is required.',
    )

    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('lets manage users bulk delete selected Work Orders', async () => {
    const formData = new FormData()
    formData.append('workOrderId', 'work-order-1')
    formData.append('workOrderId', 'work-order-2')

    await batchDeleteWorkOrdersAction(formData)

    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'user-1',
      entityType: 'work_order',
      action: 'work_order.deleted',
      targetId: 'work-order-1',
      detail: { batch: true },
    }), expect.anything())
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      targetId: 'work-order-2',
    }), expect.anything())
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/work-orders')
  })

  it('requires manage access before marking timeline entries as client-visible candidates', async () => {
    mockAssertCanManage.mockRejectedValue(new Error('Forbidden: Work Orders manage access is required.'))
    const formData = new FormData()
    formData.set('portalTitle', 'Installation booked')
    formData.set('portalMessage', 'Your installation has been booked for Tuesday.')

    await expect(markWorkOrderEventClientVisibleCandidateAction('event-1', formData)).rejects.toThrow(
      'Forbidden: Work Orders manage access is required.',
    )
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('requires a customer-safe title and message before marking a timeline entry visible to clients', async () => {
    const formData = new FormData()
    formData.set('portalTitle', 'Installation booked')
    formData.set('portalMessage', '   ')

    await expect(markWorkOrderEventClientVisibleCandidateAction('event-1', formData)).rejects.toThrow(
      'Client-visible timeline updates need a customer-safe title and message.',
    )
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('stores portal-safe timeline wording separately from internal audit details', async () => {
    const set = vi.fn(() => ({ where: vi.fn(async () => []) }))
    mockUpdate.mockReturnValue({ set })
    const formData = new FormData()
    formData.set('portalTitle', 'Installation booked')
    formData.set('portalMessage', 'Your installation has been booked for Tuesday.')

    await markWorkOrderEventClientVisibleCandidateAction('event-1', formData)

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      isClientVisibleCandidate: true,
      portalTitle: 'Installation booked',
      portalMessage: 'Your installation has been booked for Tuesday.',
      portalMarkedBy: 'user-1',
    }))
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({
      note: expect.anything(),
      fieldName: expect.anything(),
      newValue: expect.anything(),
      previousValue: expect.anything(),
    }))
    expect(mockRevalidatePath).toHaveBeenCalledWith('/work-orders')
  })

  it('requires configuration access before changing Work Order option lists', async () => {
    mockAssertCanConfigure.mockRejectedValue(new Error('Forbidden: Work Orders configuration access is required.'))
    const formData = new FormData()
    formData.set('displayName', 'Install team')

    await expect(createWorkOrderInstallerAction(formData)).rejects.toThrow(
      'Forbidden: Work Orders configuration access is required.',
    )
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('requires configuration access before changing billing exclusions', async () => {
    mockAssertCanConfigure.mockRejectedValue(new Error('Forbidden: Work Orders configuration access is required.'))
    const formData = new FormData()
    formData.set('billingExclusions', 'invoice\ndeposit')

    await expect(saveWorkOrderBillingExclusionsAction(formData)).rejects.toThrow(
      'Forbidden: Work Orders configuration access is required.',
    )
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('redirects back with saved feedback after persisting Editable choices', async () => {
    const onConflictDoUpdate = vi.fn(async () => [])
    const values = vi.fn((input: { value: string }) => {
      void input
      return { onConflictDoUpdate }
    })
    mockInsert.mockReturnValue({ values })
    const formData = new FormData()
    formData.set('editable:item', 'on')

    await saveWorkOrderSummaryConfigAction(formData)

    const saved = JSON.parse(values.mock.calls[0][0].value) as Array<{ id: string; editable: boolean }>
    expect(saved.find((field) => field.id === 'item')?.editable).toBe(true)
    expect(saved.find((field) => field.id === 'risk')?.editable).toBe(false)
    expect(mockRedirect).toHaveBeenCalledWith('/admin/work-orders?summarySaved=1')
  })

  it('prevents duplicate option names by normalized-name comparison instead of silently reusing them', async () => {
    const onConflictDoNothing = vi.fn(async () => ({ rowCount: 0 }))
    const values = vi.fn(() => ({ onConflictDoNothing }))
    mockInsert.mockReturnValue({ values })
    const formData = new FormData()
    formData.set('displayName', '  Install   Team  ')

    await createWorkOrderInstallerAction(formData)

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      displayName: 'Install   Team',
      normalizedName: 'install team',
      isActive: true,
      createdBy: 'user-1',
    }))
    expect(onConflictDoNothing).toHaveBeenCalled()
  })

  it('lets configuration users deactivate options without deleting historical references', async () => {
    const set = vi.fn(() => ({ where: vi.fn(async () => []) }))
    mockUpdate.mockReturnValue({ set })

    await deactivateWorkOrderInstallerAction('installer-1')

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      isActive: false,
      archivedAt: expect.any(Date),
    }))
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/work-orders')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/work-orders')
  })

  it('lets manage users add internal timeline notes without changing structured fields', async () => {
    const insertValues = vi.fn(async () => [])
    mockInsert.mockReturnValue({ values: insertValues })
    const formData = new FormData()
    formData.set('note', 'Client asked for a Friday install window.')

    await addWorkOrderTimelineNoteAction('work-order-1', formData)

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      workOrderId: 'work-order-1',
      actorId: 'user-1',
      fieldName: 'timeline_note_added',
      previousValue: null,
      newValue: 'Client asked for a Friday install window.',
      note: 'Client asked for a Friday install window.',
      isClientVisibleCandidate: false,
    }))
    expect(mockRevalidatePath).toHaveBeenCalledWith('/work-orders')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/work-orders/work-order-1')
  })

  it('refreshes AI suggestion without mutating operational fields', async () => {
    const set = vi.fn(() => ({ where: vi.fn(async () => []) }))
    mockUpdate.mockReturnValue({ set })
    const builder: {
      leftJoin: ReturnType<typeof vi.fn>
      where: ReturnType<typeof vi.fn>
    } = {
      leftJoin: vi.fn(() => undefined),
      where: vi.fn(() => ({
        limit: vi.fn(async () => [{
          clientName: 'Jane Client',
          jobNumber: 'R260210',
          stageName: 'Install booked',
          hardwareStatusName: 'Ready',
          riskLevel: 'high',
          importance: 'medium',
          clientContextSummary: 'Builder wants a Friday install.',
          aiSuggestionAt: null,
        }]),
      })),
    }
    builder.leftJoin.mockReturnValue(builder)
    mockSelect.mockReturnValue({
      from: vi.fn(() => builder),
    })

    await generateWorkOrderAiSuggestionAction('work-order-1')

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      aiSuggestion: expect.stringContaining('Jane Client'),
      aiSuggestionAt: expect.any(Date),
      updatedAt: expect.any(Date),
    }))
    expect(set).not.toHaveBeenCalledWith(expect.objectContaining({
      installerId: expect.anything(),
      stageOptionId: expect.anything(),
      hardwareStatusOptionId: expect.anything(),
      riskLevelOverride: expect.anything(),
      importanceOverride: expect.anything(),
      installDate: expect.anything(),
      dateCompleted: expect.anything(),
    }))
  })

  it('blocks AI suggestion refreshes during the cooldown window', async () => {
    const set = vi.fn(() => ({ where: vi.fn(async () => []) }))
    mockUpdate.mockReturnValue({ set })
    const builder: {
      leftJoin: ReturnType<typeof vi.fn>
      where: ReturnType<typeof vi.fn>
    } = {
      leftJoin: vi.fn(() => undefined),
      where: vi.fn(() => ({
        limit: vi.fn(async () => [{
          clientName: 'Jane Client',
          jobNumber: 'R260210',
          stageName: 'Install booked',
          hardwareStatusName: 'Ready',
          riskLevel: 'high',
          importance: 'medium',
          clientContextSummary: 'Builder wants a Friday install.',
          aiSuggestionAt: new Date(),
        }]),
      })),
    }
    builder.leftJoin.mockReturnValue(builder)
    mockSelect.mockReturnValue({
      from: vi.fn(() => builder),
    })

    await generateWorkOrderAiSuggestionAction('work-order-1')

    expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/work-orders/work-order-1?aiRefreshCooldownUntil='))
    expect(set).not.toHaveBeenCalled()
  })
})
