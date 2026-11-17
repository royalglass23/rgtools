import { and, asc, desc, eq, ilike, isNull, or } from 'drizzle-orm'
import { isDeepStrictEqual } from 'node:util'
import { db } from '@/lib/db'
import { settings, users } from '@rgtools/db/schema'
import { workOrderEvents, workOrderInstallers, workOrderItems, workOrders } from '@rgtools/db/schema-workorders'
import { aucklandToday, parseManualState, type ItemSave } from './work-orders'
import { assessmentIsCurrent, readStoredAssessment, resolveProductPlanning } from './assessment'
import { ASSESSMENT_SOURCE_POLICY, assessmentInstallerVersion, assessmentSnapshotHash } from './assessment-source'
import { importedFlagForJob, KANBAN_FLAGS_SETTING, readImportedFlags } from './kanban-flags'
import { applyFieldPatches, readFieldOwnership } from './field-ownership'
import { readManualReadinessDates } from './effective-fields'
import type { ReadinessDates } from './field-ownership'

export async function readWorkOrderDashboard(q = '', database: Pick<typeof db, 'select'> = db) {
  const found = await database.select({
    jobId: workOrders.id, jobNumber: workOrders.jobNumber, customer: workOrders.clientName,
    address: workOrders.jobAddress, jobUuid: workOrders.servicem8JobUuid, syncedAt: workOrders.lastServiceM8SyncedAt,
    jobInstallDate: workOrders.installDate, itemId: workOrderItems.id, itemUuid: workOrderItems.servicem8ItemUuid,
    label: workOrderItems.manualLabelOverride, generatedLabel: workOrderItems.generatedLabel,
    description: workOrderItems.originalDescription, quantity: workOrderItems.quantity,
    installDate: workOrderItems.installDate, installerId: workOrderItems.installerId,
    installer: workOrderInstallers.displayName, manual: workOrderItems.dashboardState, revision: workOrderItems.dashboardRevision,
    jobDescription: workOrders.jobDescription, assessment: workOrderItems.dashboardAssessment,
  }).from(workOrders)
    .leftJoin(workOrderItems, and(eq(workOrderItems.workOrderId, workOrders.id), eq(workOrderItems.isActive, true)))
    .leftJoin(workOrderInstallers, eq(workOrderInstallers.id, workOrderItems.installerId))
    .where(and(eq(workOrders.isCurrent, true), eq(workOrders.servicem8Active, true), eq(workOrders.servicem8Status, 'Work Order'),
      q ? or(ilike(workOrders.jobNumber, `%${q}%`), ilike(workOrders.clientName, `%${q}%`), ilike(workOrders.jobAddress, `%${q}%`), ilike(workOrderItems.originalDescription, `%${q}%`)) : undefined))
    .orderBy(asc(workOrders.jobNumber), asc(workOrderItems.sortOrder), asc(workOrderItems.id)).limit(10001)
  if (found.length > 10000) throw new Error('Too many products. Narrow the search to load the dashboard.')
  const today = aucklandToday()
  const [savedFlags] = await database.select({ value: settings.value }).from(settings).where(eq(settings.key, KANBAN_FLAGS_SETTING))
  let imported = readImportedFlags(), flagsUnavailable = false
  try { imported = readImportedFlags(savedFlags?.value) } catch { flagsUnavailable = true }
  const installers = await database.select({ id: workOrderInstallers.id, name: workOrderInstallers.displayName })
    .from(workOrderInstallers).where(eq(workOrderInstallers.isActive, true)).orderBy(asc(workOrderInstallers.displayName))
  const installerVersion = assessmentInstallerVersion(installers)
  const rows = found.map(({ jobDescription, ...row }) => {
    const assessment = readStoredAssessment(row.assessment), manual = parseManualState(row.manual)
    const ownership = readFieldOwnership(row.manual)
    const assessmentCurrent = Boolean(row.description && assessmentIsCurrent(assessment, assessmentSnapshotHash(jobDescription, row.description), row.syncedAt))
    const kanbanFlag = importedFlagForJob(imported, { id: row.jobId, jobNumber: row.jobNumber, jobUuid: row.jobUuid })
    const operationalStatus: { operationalCurrent?: boolean; legacyOwnership?: boolean; readinessDates?: ReadinessDates } = { operationalCurrent: Boolean(assessmentCurrent && assessment?.state === 'complete' && assessment.operational && assessment.sourcePolicy === ASSESSMENT_SOURCE_POLICY && assessment.installerVersion === installerVersion && assessment.sourceGeneration === (row.syncedAt?.toISOString() ?? null)), legacyOwnership: !row.manual || !Object.hasOwn(row.manual, '_ownership'), readinessDates: readManualReadinessDates(row.manual) }
    return { ...row, revision: row.revision ?? 0, syncedAt: row.syncedAt?.toISOString() ?? null,
      label: row.label ?? row.generatedLabel ?? row.description ?? 'No product recorded', manual, ownership, assessment, assessmentCurrent, ...operationalStatus,
      kanbanFlag, ...resolveProductPlanning(row.installDate, manual, assessment, assessmentCurrent, today, flagsUnavailable ? '?' : kanbanFlag?.flag ?? null, ownership.installDate),
    }
  })
  return { rows, installers, today, flagsUnavailable }
}
export type DashboardProduct = Awaited<ReturnType<typeof readWorkOrderDashboard>>['rows'][number]

export class ProductConflict extends Error {}

export async function persistProductOperations(input: ItemSave, actorId: string, database: Pick<typeof db, 'transaction'> = db) {
  return database.transaction(async tx => {
    const [job] = await tx.select({ id: workOrders.id }).from(workOrders)
      .innerJoin(workOrderItems, eq(workOrderItems.workOrderId, workOrders.id))
      .where(and(eq(workOrderItems.id, input.id), eq(workOrders.isCurrent, true), eq(workOrders.servicem8Active, true), eq(workOrders.servicem8Status, 'Work Order'))).limit(1)
    if (!job) throw new ProductConflict('This job is no longer current. Reload before editing.')
    const [item] = await tx.select().from(workOrderItems).where(eq(workOrderItems.id, input.id)).for('update')
    if (!item?.isActive) throw new ProductConflict('This product was removed. Reload before editing.')
    if (item.dashboardRevision !== input.revision || item.installerId !== input.expectedInstallerId || item.installDate !== input.expectedInstallDate) {
      throw new ProductConflict('Someone changed this product. Your edits are kept here. Reload the saved version before saving again.')
    }
    const next = applyFieldPatches(item.dashboardState, item, input.patches)
    if (next.installerId && next.installerId !== item.installerId) {
      const [installer] = await tx.select({ id: workOrderInstallers.id }).from(workOrderInstallers)
        .where(and(eq(workOrderInstallers.id, next.installerId), eq(workOrderInstallers.isActive, true))).limit(1)
      if (!installer) throw new Error('Choose an active installer.')
    }
    const previous = { dashboardState: item.dashboardState, installerId: item.installerId, installDate: item.installDate }
    if (isDeepStrictEqual(previous, next)) return { revision: item.dashboardRevision }
    const revision = item.dashboardRevision + 1
    await tx.update(workOrderItems).set({ dashboardState: next.dashboardState, dashboardRevision: revision,
      installerId: next.installerId, installDate: next.installDate, updatedAt: new Date() }).where(eq(workOrderItems.id, input.id))
    await tx.insert(workOrderEvents).values({ workOrderId: job.id, workOrderItemId: input.id, actorId,
      fieldName: 'dashboard_manual_updated', previousValue: previous, newValue: next, isClientVisibleCandidate: false })
    return { revision }
  })
}

export async function readProductHistory(itemId: string, page = 1) {
  const [item] = await db.select({ jobId: workOrderItems.workOrderId }).from(workOrderItems).where(eq(workOrderItems.id, itemId)).limit(1)
  return db.select({ id: workOrderEvents.id, actor: users.username, field: workOrderEvents.fieldName,
    previous: workOrderEvents.previousValue, next: workOrderEvents.newValue, createdAt: workOrderEvents.createdAt })
    .from(workOrderEvents).leftJoin(users, eq(users.id, workOrderEvents.actorId))
    .where(or(eq(workOrderEvents.workOrderItemId, itemId), item ? and(eq(workOrderEvents.workOrderId, item.jobId), isNull(workOrderEvents.workOrderItemId), eq(workOrderEvents.fieldName, 'dashboard_kanban_flag_imported')) : undefined)).orderBy(desc(workOrderEvents.createdAt), desc(workOrderEvents.id))
    .limit(21).offset((page - 1) * 20)
}
