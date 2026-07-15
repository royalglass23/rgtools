'use server'

import { and, eq, inArray, notInArray, or, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { logAudit } from '@/lib/audit-db'
import { db } from '@/lib/db'
import { createServiceM8RequestFromEnv, type ServiceM8FetchRequest } from '@/lib/servicem8/client'
import { quotes, settings } from '@rgtools/db/schema'
import {
  workOrderHardwareStatusOptions,
  workOrderInstallers,
  workOrderItems,
  workOrderEvents,
  workOrderRefreshRuns,
  workOrders,
  workOrderStageOptions,
} from '@rgtools/db/schema-workorders'
import { normalizeConfigName, WORK_ORDER_AI_SUGGESTION_COOLDOWN_MS, type WorkOrderLevel } from './domain'
import {
  getWorkOrderBillingExclusions,
  parseWorkOrderBillingExclusionText,
  serializeWorkOrderBillingExclusions,
  WORK_ORDER_BILLING_EXCLUSIONS_KEY,
} from './billing-exclusions'
import {
  assertCurrentUserCanConfigureWorkOrders,
  assertCurrentUserCanManageWorkOrders,
} from './permissions'
import { findLinkedLeadAndClient } from './queries'
import {
  mapServiceM8JobsToWorkOrderInputs,
  normalizeServiceM8JobMaterials,
  validateServiceM8JobMaterials,
  type ServiceM8JobMaterial,
  type ServiceM8Material,
  type ServiceM8WorkOrderJob,
} from './servicem8-sync'
import {
  getWorkOrderSummaryConfig,
  serializeSummaryConfig,
  WORK_ORDER_SUMMARY_FIELD_CATALOG,
  WORK_ORDER_SUMMARY_CONFIG_KEY,
  type WorkOrderSummaryFieldId,
} from './summary-config'
import { updateActiveWorkOrderItem } from './active-item-write'
import { canConfigureSummaryFieldAsEditable } from './summary-field-policy'
import {
  fingerprintSourceDescription,
  refreshWorkOrderItemLabels,
  type WorkOrderItemLabelStore,
} from './item-label-lifecycle'
import { generateWorkOrderItemLabel, type WorkOrderItemLabelGenerator } from './item-labels'
import {
  parseWorkOrderItemOperationalValue,
  readWorkOrderItemOperationalValue,
  workOrderItemOperationalEventName,
  workOrderItemOperationalUpdate,
  type WorkOrderItemOperationalField,
} from './item-operational-fields'

type ServiceM8Company = {
  uuid?: string | null
  name?: string | null
  active?: number | string | boolean | null
}

const WORK_ORDER_FILTER = "active eq 1 and status eq 'Work Order'"
const ACTIVE_FILTER = 'active eq 1'

export async function refreshWorkOrdersAction() {
  await assertCurrentUserCanManageWorkOrders()

  try {
    await refreshWorkOrdersFromServiceM8()
  } catch (error) {
    redirect(`/work-orders?refreshError=${encodeURIComponent(safeRefreshErrorMessage(error))}`)
  }

  revalidatePath('/work-orders')
}

export async function batchDeleteWorkOrdersAction(formData: FormData): Promise<void> {
  await assertCurrentUserCanManageWorkOrders()
  const session = await auth()

  const workOrderIds = formData
    .getAll('workOrderId')
    .map((value) => String(value))
    .filter(Boolean)

  if (workOrderIds.length === 0) return

  await db.transaction(async (tx) => {
    await tx
      .delete(workOrders)
      .where(inArray(workOrders.id, workOrderIds))

    await Promise.all(workOrderIds.map((workOrderId) =>
      logAudit({
        actorId: session?.user?.id ?? null,
        entityType: 'work_order',
        action: 'work_order.deleted',
        targetId: workOrderId,
        detail: { batch: true },
      }, tx),
    ))
  })

  revalidatePath('/')
  revalidatePath('/work-orders')
}

export async function refreshWorkOrdersFromServiceM8(
  request: ServiceM8FetchRequest = createServiceM8RequestFromEnv(),
  generateLabel: WorkOrderItemLabelGenerator = generateWorkOrderItemLabel,
) {
  await assertCurrentUserCanManageWorkOrders()

  let jobRows: ServiceM8WorkOrderJob[]
  let companyRows: ServiceM8Company[]
  let jobMaterialRows: ServiceM8JobMaterial[]
  let materialRows: ServiceM8Material[]
  let billingExclusions: string[]

  try {
    [jobRows, companyRows, jobMaterialRows, materialRows, billingExclusions] = await Promise.all([
      readServiceM8Array<ServiceM8WorkOrderJob>(request, `/job.json${odataFilter(WORK_ORDER_FILTER)}`, 'job'),
      readServiceM8Array<ServiceM8Company>(request, '/company.json', 'company'),
      readServiceM8Array<ServiceM8JobMaterial>(request, `/jobmaterial.json${odataFilter(ACTIVE_FILTER)}`, 'jobmaterial'),
      readServiceM8Array<ServiceM8Material>(request, '/material.json', 'material'),
      getWorkOrderBillingExclusions(),
    ])
  } catch (error) {
    await recordRefreshFailure(error)
    throw error
  }

  const companiesByUuid = new Map(
    companyRows
      .filter((company) => company.uuid)
      .map((company) => [company.uuid as string, company]),
  )

  let normalizedSource: {
    inputs: ReturnType<typeof mapServiceM8JobsToWorkOrderInputs>
    itemInputs: ReturnType<typeof normalizeServiceM8JobMaterials>['inputs']
    excludedLineCount: number
  }
  try {
    const inputs = mapServiceM8JobsToWorkOrderInputs(jobRows)
    const activeJobUuids = new Set(inputs.flatMap((input) => (
      input.servicem8JobUuid ? [input.servicem8JobUuid] : []
    )))
    validateServiceM8JobMaterials(jobMaterialRows)
    const normalizedItems = normalizeServiceM8JobMaterials(
      jobMaterialRows.filter((row) => activeJobUuids.has(String(row.job_uuid ?? '').trim())),
      materialRows,
      billingExclusions,
    )
    normalizedSource = {
      inputs,
      itemInputs: normalizedItems.inputs,
      excludedLineCount: normalizedItems.excludedLineCount,
    }
  } catch (error) {
    await recordRefreshFailure(error)
    throw error
  }

  const { inputs, itemInputs, excludedLineCount } = normalizedSource
  const itemInputsByJobUuid = new Map<string, typeof itemInputs>()
  for (const itemInput of itemInputs) {
    const groupedInputs = itemInputsByJobUuid.get(itemInput.servicem8JobUuid) ?? []
    groupedInputs.push(itemInput)
    itemInputsByJobUuid.set(itemInput.servicem8JobUuid, groupedInputs)
  }
  const now = new Date()
  const seenIdentityKeys = inputs.map((input) => `${input.identityKind}:${input.identityValue}`)
  const seenItemUuids = itemInputs.map((input) => input.servicem8ItemUuid)
  let itemsSynced = 0

  try {
    await db.transaction(async (tx) => {
      for (const input of inputs) {
        const [linked, quote] = await Promise.all([
          findLinkedLeadAndClient({
            servicem8JobUuid: input.servicem8JobUuid,
            jobNumber: input.jobNumber,
          }),
          findLinkedQuote({
            servicem8JobUuid: input.servicem8JobUuid,
            jobNumber: input.jobNumber,
          }),
        ])

        const company = input.servicem8CompanyUuid ? companiesByUuid.get(input.servicem8CompanyUuid) : null
        const clientName = linked?.clientName ?? quote?.clientName ?? company?.name?.trim() ?? input.jobNumber ?? 'Unknown client'

        const [persistedWorkOrder] = await tx
          .insert(workOrders)
          .values({
            identityKind: input.identityKind,
            identityValue: input.identityValue,
            servicem8CompanyUuid: input.servicem8CompanyUuid,
            servicem8JobUuid: input.servicem8JobUuid,
            servicem8Status: input.servicem8Status,
            servicem8Active: input.servicem8Active,
            isCurrent: true,
            jobNumber: input.jobNumber,
            jobAddress: input.jobAddress,
            jobDescription: input.jobDescription,
            approximateDescription: input.approximateDescription,
            systemName: input.systemName,
            length: input.length,
            color: input.color,
            itemsServices: input.itemsServices,
            glassStatus: input.glassStatus,
            designStatus: input.designStatus,
            siteCondition: input.siteCondition,
            remarks: input.remarks,
            rawServiceM8Snapshot: input.rawServiceM8Snapshot,
            clientId: linked?.clientId ?? quote?.clientId ?? null,
            leadId: linked?.leadId ?? null,
            quoteId: quote?.id ?? null,
            clientName,
            companyName: linked?.companyName ?? quote?.companyName ?? null,
            leadScore: linked?.leadScore ?? null,
            lastServiceM8SyncedAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [workOrders.identityKind, workOrders.identityValue],
            set: {
              servicem8CompanyUuid: input.servicem8CompanyUuid,
              servicem8JobUuid: input.servicem8JobUuid,
              servicem8Status: input.servicem8Status,
              servicem8Active: input.servicem8Active,
              isCurrent: true,
              jobNumber: input.jobNumber,
              jobAddress: input.jobAddress,
              jobDescription: input.jobDescription,
              approximateDescription: input.approximateDescription,
              systemName: input.systemName,
              length: input.length,
              color: input.color,
              itemsServices: input.itemsServices,
              glassStatus: input.glassStatus,
              designStatus: input.designStatus,
              siteCondition: input.siteCondition,
              remarks: input.remarks,
              rawServiceM8Snapshot: input.rawServiceM8Snapshot,
              clientId: linked?.clientId ?? quote?.clientId ?? null,
              leadId: linked?.leadId ?? null,
              quoteId: quote?.id ?? null,
              clientName,
              companyName: linked?.companyName ?? quote?.companyName ?? null,
              leadScore: linked?.leadScore ?? null,
              lastServiceM8SyncedAt: now,
              updatedAt: now,
            },
          })
          .returning({ id: workOrders.id })

        if (!persistedWorkOrder) {
          throw new Error(`Work Order refresh could not persist ${input.identityKind}:${input.identityValue}.`)
        }

        const workOrderItemInputs = input.servicem8JobUuid
          ? itemInputsByJobUuid.get(input.servicem8JobUuid) ?? []
          : []

        for (const itemInput of workOrderItemInputs) {
          await tx
            .insert(workOrderItems)
            .values({
              workOrderId: persistedWorkOrder.id,
              servicem8ItemUuid: itemInput.servicem8ItemUuid,
              servicem8JobUuid: itemInput.servicem8JobUuid,
              itemCode: itemInput.itemCode,
              quantity: itemInput.quantity,
              originalDescription: itemInput.originalDescription,
              lineTotalExcludingGst: itemInput.lineTotalExcludingGst,
              sortOrder: itemInput.sortOrder,
              isActive: true,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: workOrderItems.servicem8ItemUuid,
              set: {
                workOrderId: persistedWorkOrder.id,
                servicem8JobUuid: itemInput.servicem8JobUuid,
                itemCode: itemInput.itemCode,
                quantity: itemInput.quantity,
                originalDescription: itemInput.originalDescription,
                lineTotalExcludingGst: itemInput.lineTotalExcludingGst,
                sortOrder: itemInput.sortOrder,
                isActive: true,
                updatedAt: now,
              },
            })
          itemsSynced += 1
        }
      }

      await tx
        .update(workOrders)
        .set({
          servicem8Active: false,
          isCurrent: false,
          updatedAt: now,
        })
        .where(
          seenIdentityKeys.length > 0
            ? notInArray(sql<string>`${workOrders.identityKind} || ':' || ${workOrders.identityValue}`, seenIdentityKeys)
            : undefined,
        )

      await tx
        .update(workOrderItems)
        .set({
          isActive: false,
          updatedAt: now,
        })
        .where(
          seenItemUuids.length > 0
            ? notInArray(workOrderItems.servicem8ItemUuid, seenItemUuids)
            : undefined,
        )

      await tx.insert(workOrderRefreshRuns).values({
        status: 'success',
        syncedCount: inputs.length,
        itemSyncedCount: itemsSynced,
        excludedLineCount,
      })
    })
  } catch (error) {
    await recordRefreshFailure(error)
    throw error
  }

  try {
    await refreshPersistedWorkOrderItemLabels(generateLabel)
  } catch {
    // ServiceM8 reconciliation is already committed. Label processing remains retryable.
  }

  return { synced: inputs.length, itemsSynced, excludedLineCount }
}

export async function updateWorkOrderItemLabelAction(itemId: string, formData: FormData) {
  await assertCurrentUserCanManageWorkOrders()
  const label = parseManualWorkOrderItemLabel(formData.get('label'))
  await assertSummaryFieldEditingEnabled('item')
  const session = await auth()
  const result = await db.transaction(async (tx) => {
    const item = await getWorkOrderItemLabelRecord(itemId, tx)
    if (!item.isActive) throw new Error(`Work Order Item ${itemId} is removed and cannot be edited.`)
    const previousLabel = item.manualLabelOverride ?? item.generatedLabel

    await updateActiveWorkOrderItem(tx, itemId, {
      manualLabelOverride: label,
      labelStatus: 'manual',
      sourceDescriptionFingerprint: fingerprintSourceDescription(item.originalDescription),
      updatedAt: new Date(),
    })

    await tx.insert(workOrderEvents).values({
      workOrderId: item.workOrderId,
      workOrderItemId: item.id,
      actorId: session?.user?.id ?? null,
      fieldName: 'item_label_manually_updated',
      previousValue: previousLabel,
      newValue: label,
      isClientVisibleCandidate: false,
    })

    await logAudit({
      actorId: session?.user?.id ?? null,
      entityType: 'work_order_item',
      action: 'work_order_item.label_manually_updated',
      targetId: itemId,
      detail: {
        workOrderId: item.workOrderId,
        previousLabel,
        newLabel: label,
      },
    }, tx)

    return { workOrderId: item.workOrderId }
  })

  revalidateWorkOrderItemPaths(result.workOrderId)
}

export async function updateWorkOrderItemOperationalFieldAction(
  itemId: string,
  field: WorkOrderItemOperationalField,
  value: string | null,
) {
  await assertCurrentUserCanManageWorkOrders()
  const normalizedValue = parseWorkOrderItemOperationalValue(field, value)
  await assertSummaryFieldEditingEnabled(field)
  const session = await auth()

  const result = await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        id: workOrderItems.id,
        workOrderId: workOrderItems.workOrderId,
        isActive: workOrderItems.isActive,
        installerId: workOrderItems.installerId,
        stageOptionId: workOrderItems.stageOptionId,
        hardwareStatusOptionId: workOrderItems.hardwareStatusOptionId,
        maintenanceProgram: workOrderItems.maintenanceProgram,
        installDate: workOrderItems.installDate,
        dateCompleted: workOrderItems.dateCompleted,
        riskLevelOverride: workOrderItems.riskLevelOverride,
        importanceOverride: workOrderItems.importanceOverride,
      })
      .from(workOrderItems)
      .where(eq(workOrderItems.id, itemId))
      .limit(1)

    if (!item) throw new Error(`Work Order Item ${itemId} was not found.`)
    if (!item.isActive) throw new Error(`Work Order Item ${itemId} is removed and cannot be edited.`)
    await assertActiveWorkOrderItemOption(tx, field, normalizedValue)
    const previousValue = readWorkOrderItemOperationalValue(item, field)

    if (previousValue === normalizedValue) {
      return { workOrderId: item.workOrderId, value: normalizedValue }
    }

    await updateActiveWorkOrderItem(tx, itemId, {
      ...workOrderItemOperationalUpdate(field, normalizedValue),
      updatedAt: new Date(),
    })

    await tx.insert(workOrderEvents).values({
      workOrderId: item.workOrderId,
      workOrderItemId: item.id,
      actorId: session?.user?.id ?? null,
      fieldName: workOrderItemOperationalEventName(field),
      previousValue,
      newValue: normalizedValue,
      isClientVisibleCandidate: false,
    })

    return { workOrderId: item.workOrderId, value: normalizedValue }
  })

  revalidateWorkOrderItemPaths(result.workOrderId)
  return { value: result.value }
}

export async function regenerateWorkOrderItemLabelAction(itemId: string) {
  await assertCurrentUserCanManageWorkOrders()
  await assertSummaryFieldEditingEnabled('item')
  const session = await auth()
  const item = await getWorkOrderItemLabelRecord(itemId)
  if (!item.isActive) throw new Error(`Work Order Item ${itemId} is removed and cannot be edited.`)
  const label = await generateWorkOrderItemLabel(item.originalDescription)

  const result = await db.transaction(async (tx) => {
    const currentItem = await getWorkOrderItemLabelRecord(itemId, tx)
    if (!currentItem.isActive) throw new Error(`Work Order Item ${itemId} is removed and cannot be edited.`)
    const previousLabel = currentItem.manualLabelOverride ?? currentItem.generatedLabel

    await updateActiveWorkOrderItem(tx, itemId, {
      generatedLabel: label,
      manualLabelOverride: null,
      labelStatus: 'generated',
      sourceDescriptionFingerprint: fingerprintSourceDescription(item.originalDescription),
      updatedAt: new Date(),
    })

    await tx.insert(workOrderEvents).values({
      workOrderId: currentItem.workOrderId,
      workOrderItemId: currentItem.id,
      actorId: session?.user?.id ?? null,
      fieldName: 'item_label_regenerated',
      previousValue: previousLabel,
      newValue: label,
      isClientVisibleCandidate: false,
    })

    await logAudit({
      actorId: session?.user?.id ?? null,
      entityType: 'work_order_item',
      action: 'work_order_item.label_regenerated',
      targetId: itemId,
      detail: {
        workOrderId: currentItem.workOrderId,
        previousLabel,
        newLabel: label,
      },
    }, tx)

    return { workOrderId: currentItem.workOrderId }
  })

  revalidateWorkOrderItemPaths(result.workOrderId)
}

async function assertSummaryFieldEditingEnabled(fieldId: WorkOrderSummaryFieldId) {
  const fields = await getWorkOrderSummaryConfig()
  const field = fields.find((candidate) => candidate.id === fieldId)
  if (field?.editable && canConfigureSummaryFieldAsEditable(fieldId)) return

  const label = field?.label ?? fieldId
  throw new Error(`${label} editing is disabled in Work Order Summary Configuration.`)
}

async function getWorkOrderItemLabelRecord(itemId: string, database: Pick<typeof db, 'select'> = db) {
  const [item] = await database
    .select({
      id: workOrderItems.id,
      workOrderId: workOrderItems.workOrderId,
      originalDescription: workOrderItems.originalDescription,
      generatedLabel: workOrderItems.generatedLabel,
      manualLabelOverride: workOrderItems.manualLabelOverride,
      isActive: workOrderItems.isActive,
    })
    .from(workOrderItems)
    .where(eq(workOrderItems.id, itemId))
    .limit(1)

  if (!item) throw new Error(`Work Order Item ${itemId} was not found.`)
  return item
}

async function assertActiveWorkOrderItemOption(
  database: Pick<Parameters<Parameters<typeof db.transaction>[0]>[0], 'select'>,
  field: WorkOrderItemOperationalField,
  value: ReturnType<typeof parseWorkOrderItemOperationalValue>,
) {
  if (typeof value !== 'string') return

  if (field === 'installer') {
    const [option] = await database
      .select({ id: workOrderInstallers.id })
      .from(workOrderInstallers)
      .where(and(eq(workOrderInstallers.id, value), eq(workOrderInstallers.isActive, true)))
      .limit(1)
    if (!option) throw new Error(`Installer option ${value} does not exist or is inactive.`)
    return
  }

  if (field === 'stage') {
    const [option] = await database
      .select({ id: workOrderStageOptions.id })
      .from(workOrderStageOptions)
      .where(and(eq(workOrderStageOptions.id, value), eq(workOrderStageOptions.isActive, true)))
      .limit(1)
    if (!option) throw new Error(`Stage option ${value} does not exist or is inactive.`)
    return
  }

  if (field === 'hardware') {
    const [option] = await database
      .select({ id: workOrderHardwareStatusOptions.id })
      .from(workOrderHardwareStatusOptions)
      .where(and(eq(workOrderHardwareStatusOptions.id, value), eq(workOrderHardwareStatusOptions.isActive, true)))
      .limit(1)
    if (!option) throw new Error(`Hardware option ${value} does not exist or is inactive.`)
  }
}

function parseManualWorkOrderItemLabel(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') throw new Error('Work Order Item label is required.')
  const label = value.trim()
  if (!label) throw new Error('Work Order Item label is required.')
  if (/\r|\n/.test(label)) throw new Error('Work Order Item label must be one line.')
  if (label.length > 160) throw new Error('Work Order Item label must be 160 characters or fewer.')
  return label
}

function revalidateWorkOrderItemPaths(workOrderId: string) {
  revalidatePath('/')
  revalidatePath('/work-orders')
  revalidatePath(`/work-orders/${workOrderId}`)
}

async function refreshPersistedWorkOrderItemLabels(generateLabel: WorkOrderItemLabelGenerator) {
  const items = await db
    .select({
      id: workOrderItems.id,
      originalDescription: workOrderItems.originalDescription,
      generatedLabel: workOrderItems.generatedLabel,
      manualLabelOverride: workOrderItems.manualLabelOverride,
      labelStatus: workOrderItems.labelStatus,
      sourceDescriptionFingerprint: workOrderItems.sourceDescriptionFingerprint,
    })
    .from(workOrderItems)
    .where(eq(workOrderItems.isActive, true))

  const store: WorkOrderItemLabelStore = {
    markPending: (itemId) => updateWorkOrderItemLabelState(itemId, {
      generatedLabel: null,
      labelStatus: 'pending',
    }),
    saveGenerated: (itemId, label, sourceDescriptionFingerprint) => updateWorkOrderItemLabelState(itemId, {
      generatedLabel: label,
      manualLabelOverride: null,
      labelStatus: 'generated',
      sourceDescriptionFingerprint,
    }),
    markFailed: (itemId) => updateWorkOrderItemLabelState(itemId, {
      generatedLabel: null,
      labelStatus: 'failed',
    }),
    markSourceChanged: (itemId) => updateWorkOrderItemLabelState(itemId, {
      labelStatus: 'source_changed',
    }),
  }

  return refreshWorkOrderItemLabels(items, store, generateLabel)
}

async function updateWorkOrderItemLabelState(
  itemId: string,
  values: Partial<typeof workOrderItems.$inferInsert>,
) {
  await db
    .update(workOrderItems)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(workOrderItems.id, itemId))
}

export async function createWorkOrderInstallerAction(formData: FormData) {
  await createConfigOption({
    formData,
    table: workOrderInstallers,
    label: 'installer',
  })
}

export async function createWorkOrderStageAction(formData: FormData) {
  await createConfigOption({
    formData,
    table: workOrderStageOptions,
    label: 'stage',
  })
}

export async function createWorkOrderHardwareStatusAction(formData: FormData) {
  await createConfigOption({
    formData,
    table: workOrderHardwareStatusOptions,
    label: 'hardware status',
  })
}

export async function deactivateWorkOrderInstallerAction(optionId: string) {
  await deactivateConfigOption(optionId, workOrderInstallers)
}

export async function deactivateWorkOrderStageAction(optionId: string) {
  await deactivateConfigOption(optionId, workOrderStageOptions)
}

export async function deactivateWorkOrderHardwareStatusAction(optionId: string) {
  await deactivateConfigOption(optionId, workOrderHardwareStatusOptions)
}

export async function saveWorkOrderSummaryConfigAction(formData: FormData) {
  await assertCurrentUserCanConfigureWorkOrders()
  const session = await auth()

  const fields = WORK_ORDER_SUMMARY_FIELD_CATALOG.map((field) => ({
    ...field,
    visible: formData.get(`visible:${field.id}`) === 'on',
    filterable: formData.get(`filterable:${field.id}`) === 'on',
    editable: canConfigureSummaryFieldAsEditable(field.id)
      && formData.get(`editable:${field.id}`) === 'on',
    order: Number(formData.get(`order:${field.id}`) ?? field.order) || field.order,
  })).sort((a, b) => a.order - b.order)

  await db
    .insert(settings)
    .values({
      key: WORK_ORDER_SUMMARY_CONFIG_KEY,
      value: serializeSummaryConfig(fields),
      updatedBy: session?.user?.id ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: serializeSummaryConfig(fields),
        updatedBy: session?.user?.id ?? null,
        updatedAt: new Date(),
      },
    })

  revalidatePath('/admin/work-orders')
  revalidatePath('/work-orders')
  redirect('/admin/work-orders?summarySaved=1')
}

export async function saveWorkOrderBillingExclusionsAction(formData: FormData) {
  await assertCurrentUserCanConfigureWorkOrders()
  const session = await auth()
  const terms = parseWorkOrderBillingExclusionText(String(formData.get('billingExclusions') ?? ''))

  if (terms.length > 25 || terms.some((term) => term.length > 80)) {
    throw new Error('Billing exclusions must contain at most 25 terms of 80 characters or fewer.')
  }

  await db
    .insert(settings)
    .values({
      key: WORK_ORDER_BILLING_EXCLUSIONS_KEY,
      value: serializeWorkOrderBillingExclusions(terms),
      updatedBy: session?.user?.id ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: serializeWorkOrderBillingExclusions(terms),
        updatedBy: session?.user?.id ?? null,
        updatedAt: new Date(),
      },
    })

  revalidatePath('/admin/work-orders')
}

export async function markWorkOrderEventClientVisibleCandidateAction(eventId: string, formData: FormData) {
  await assertCurrentUserCanManageWorkOrders()

  const portalTitle = nullableString(formData.get('portalTitle'))
  const portalMessage = nullableString(formData.get('portalMessage'))
  if (!portalTitle || !portalMessage) {
    throw new Error('Client-visible timeline updates need a customer-safe title and message.')
  }

  const session = await auth()
  await db
    .update(workOrderEvents)
    .set({
      isClientVisibleCandidate: true,
      portalTitle,
      portalMessage,
      portalMarkedBy: session?.user?.id ?? null,
      portalMarkedAt: new Date(),
    })
    .where(eq(workOrderEvents.id, eventId))

  revalidatePath('/work-orders')
}

export async function addWorkOrderTimelineNoteAction(workOrderId: string, formData: FormData) {
  await assertCurrentUserCanManageWorkOrders()
  const note = nullableString(formData.get('note'))
  if (!note) throw new Error('Timeline note is required.')

  const session = await auth()
  await db.insert(workOrderEvents).values({
    workOrderId,
    actorId: session?.user?.id ?? null,
    fieldName: 'timeline_note_added',
    previousValue: null,
    newValue: note,
    note,
    isClientVisibleCandidate: false,
  })

  revalidatePath('/work-orders')
  revalidatePath(`/work-orders/${workOrderId}`)
}

export async function generateWorkOrderAiSuggestionAction(workOrderId: string) {
  await assertCurrentUserCanManageWorkOrders()

  const [detail] = await db
    .select({
      clientName: workOrders.clientName,
      jobNumber: workOrders.jobNumber,
      stageName: workOrderStageOptions.displayName,
      hardwareStatusName: workOrderHardwareStatusOptions.displayName,
      riskLevel: sql<WorkOrderLevel | null>`coalesce(${workOrders.riskLevelOverride}, ${workOrders.aiRiskLevel})`,
      importance: sql<WorkOrderLevel | null>`coalesce(${workOrders.importanceOverride}, ${workOrders.aiImportance})`,
      clientContextSummary: workOrders.clientContextSummary,
      aiSuggestionAt: workOrders.aiSuggestionAt,
    })
    .from(workOrders)
    .leftJoin(workOrderStageOptions, eq(workOrders.stageOptionId, workOrderStageOptions.id))
    .leftJoin(workOrderHardwareStatusOptions, eq(workOrders.hardwareStatusOptionId, workOrderHardwareStatusOptions.id))
    .where(eq(workOrders.id, workOrderId))
    .limit(1)

  if (!detail) throw new Error('Work Order not found.')
  const now = new Date()
  const cooldownUntil = detail.aiSuggestionAt
    ? new Date(detail.aiSuggestionAt.getTime() + WORK_ORDER_AI_SUGGESTION_COOLDOWN_MS)
    : null

  if (cooldownUntil && cooldownUntil > now) {
    return redirect(`/work-orders/${workOrderId}?aiRefreshCooldownUntil=${encodeURIComponent(cooldownUntil.toISOString())}`)
  }

  await db
    .update(workOrders)
    .set({
      aiSuggestion: buildWorkOrderAiSuggestion(detail),
      aiSuggestionAt: now,
      updatedAt: now,
    })
    .where(eq(workOrders.id, workOrderId))

  revalidatePath(`/work-orders/${workOrderId}`)
}

async function createConfigOption({
  formData,
  table,
  label,
}: {
  formData: FormData
  table: typeof workOrderInstallers | typeof workOrderStageOptions | typeof workOrderHardwareStatusOptions
  label: string
}) {
  await assertCurrentUserCanConfigureWorkOrders()
  const session = await auth()

  const displayName = String(formData.get('displayName') ?? '').trim()
  if (!displayName) throw new Error(`Missing ${label} name`)

  const now = new Date()
  await db
    .insert(table)
    .values({
      displayName,
      normalizedName: normalizeConfigName(displayName),
      isActive: true,
      createdBy: session?.user?.id ?? null,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: table.normalizedName,
    })

  revalidatePath('/admin/work-orders')
  revalidatePath('/work-orders')
}

async function deactivateConfigOption(
  optionId: string,
  table: typeof workOrderInstallers | typeof workOrderStageOptions | typeof workOrderHardwareStatusOptions,
) {
  await assertCurrentUserCanConfigureWorkOrders()
  const now = new Date()

  await db
    .update(table)
    .set({
      isActive: false,
      archivedAt: now,
      updatedAt: now,
    })
    .where(eq(table.id, optionId))

  revalidatePath('/admin/work-orders')
  revalidatePath('/work-orders')
}

function nullableString(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function buildWorkOrderAiSuggestion(input: {
  clientName: string
  jobNumber: string | null
  stageName: string | null
  hardwareStatusName: string | null
  riskLevel: WorkOrderLevel | null
  importance: WorkOrderLevel | null
  clientContextSummary: string | null
}) {
  const attention = [
    input.riskLevel ? `${input.riskLevel} risk` : null,
    input.importance ? `${input.importance} importance` : null,
    input.stageName ? `stage: ${input.stageName}` : null,
    input.hardwareStatusName ? `hardware: ${input.hardwareStatusName}` : null,
  ].filter(Boolean).join(', ')

  const context = input.clientContextSummary?.trim()
  return [
    `Next action for ${input.clientName}${input.jobNumber ? ` (${input.jobNumber})` : ''}: review the current work order state and confirm the next delivery step with the responsible staff member.`,
    attention ? `Attention signals: ${attention}.` : null,
    context ? `Context: ${context}` : null,
  ].filter(Boolean).join('\n')
}

async function findLinkedQuote(input: {
  servicem8JobUuid: string | null
  jobNumber: string | null
}) {
  const conditions = []
  if (input.servicem8JobUuid) conditions.push(eq(quotes.servicem8Uuid, input.servicem8JobUuid))
  if (input.jobNumber) conditions.push(eq(quotes.workOrderId, input.jobNumber))
  if (conditions.length === 0) return null

  const [quote] = await db
    .select({
      id: quotes.id,
      clientId: quotes.clientId,
      clientName: quotes.clientName,
      companyName: quotes.companyName,
    })
    .from(quotes)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .limit(1)

  return quote ?? null
}

async function recordRefreshFailure(error: unknown) {
  await db.insert(workOrderRefreshRuns).values({
    status: 'failed',
    errorMessage: safeRefreshErrorMessage(error),
  })
}

async function readServiceM8Array<T>(
  request: ServiceM8FetchRequest,
  path: string,
  datasetName: string,
): Promise<T[]> {
  const completeRows: T[] = []
  const requestedCursors = new Set<string>()
  let cursor: string | null = '-1'

  while (cursor) {
    if (requestedCursors.has(cursor)) {
      throw new Error(`ServiceM8 ${datasetName} pagination was invalid: cursor ${cursor} repeated.`)
    }
    requestedCursors.add(cursor)

    const response = await request(serviceM8CursorPath(path, cursor))
    if (!response.ok) throw new Error(`ServiceM8 request failed with HTTP ${response.status}`)
    const pageRows = await response.json()
    if (!Array.isArray(pageRows)) {
      throw new Error(`ServiceM8 ${datasetName} response was invalid: expected an array.`)
    }
    const invalidRowIndex = pageRows.findIndex((row) => !row || typeof row !== 'object' || Array.isArray(row))
    if (invalidRowIndex >= 0) {
      throw new Error(
        `ServiceM8 ${datasetName} response was invalid: row ${completeRows.length + invalidRowIndex + 1} must be an object.`,
      )
    }

    completeRows.push(...pageRows as T[])
    cursor = response.headers?.get('x-next-cursor')?.trim() || null
  }

  return completeRows
}

function serviceM8CursorPath(path: string, cursor: string): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}cursor=${encodeURIComponent(cursor)}`
}

function odataFilter(expr: string): string {
  return `?%24filter=${encodeURIComponent(expr)}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'ServiceM8 refresh failed'
}

function safeRefreshErrorMessage(error: unknown) {
  const message = errorMessage(error)
  if (message.startsWith('ServiceM8')) {
    return `${message} The previous dashboard snapshot was kept.`
  }
  return 'Work Orders refresh could not be completed. The previous dashboard snapshot was kept.'
}
