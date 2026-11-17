import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { isDeepStrictEqual } from 'node:util'
import { workOrders, workOrderItems, workOrderEvents, workOrderInstallers } from '@rgtools/db/schema-workorders'
import { ASSESSMENT_RULES, readStoredAssessment, type AssessmentJob, type AssessmentStore, type StoredAssessment, type AssessmentInstaller } from './assessment'
import { lockAssessmentClaim, publishAssessmentClaim } from './assessment-run-store'

export function createAssessmentStore(database: Pick<typeof db, 'select' | 'transaction'> = db): AssessmentStore {
  const store: AssessmentStore = {
  async list() {
    const installerRows = await database.select({ id: workOrderInstallers.id, name: workOrderInstallers.displayName }).from(workOrderInstallers).where(eq(workOrderInstallers.isActive, true)).orderBy(asc(workOrderInstallers.id))
    const installers: AssessmentInstaller[] = installerRows.map((row, i) => ({ ...row, token: `i${i}` }))
    const rows = await database.select({ id: workOrderItems.id, workOrderId: workOrders.id, sourceId: workOrders.servicem8JobUuid,
      customer: workOrders.clientName, address: workOrders.jobAddress, jobDescription: workOrders.jobDescription,
      sourceGeneration: workOrders.lastServiceM8SyncedAt,
      label: workOrderItems.manualLabelOverride, description: workOrderItems.originalDescription, stored: workOrderItems.dashboardAssessment,
    }).from(workOrders).leftJoin(workOrderItems, and(eq(workOrderItems.workOrderId, workOrders.id), eq(workOrderItems.isActive, true)))
      .where(and(eq(workOrders.isCurrent, true), eq(workOrders.servicem8Active, true), eq(workOrders.servicem8Status, 'Work Order')))
      .orderBy(asc(workOrders.id), asc(workOrderItems.id)).limit(10001)
    if (rows.length > 10000) throw new Error('Assessment inventory exceeds its bounded limit.')
    const jobs = new Map<string, AssessmentJob>()
    for (const row of rows) {
      const job = jobs.get(row.workOrderId) ?? { id: row.workOrderId, sourceId: row.sourceId ?? '', customer: row.customer, address: row.address, description: row.jobDescription, sourceGeneration: row.sourceGeneration?.toISOString() ?? null, installers, items: [] }
      if (row.id && row.description !== null) job.items.push({ id: row.id, label: row.label ?? row.description, description: row.description, stored: readStoredAssessment(row.stored) })
      jobs.set(job.id, job)
    }
    const oldest = (job: AssessmentJob) => job.items.map(item => item.stored?.checkedAt ?? '').sort()[0] ?? ''
    return [...jobs.values()].sort((a, b) => oldest(a).localeCompare(oldest(b)))
  },
  async save(job, values, actorId) {
    return database.transaction(async tx => {
      if (job.claim) {
        const claimed = job.claim.executorId === actorId ? await lockAssessmentClaim(tx, job.claim) : null
        if (!claimed || claimed.workOrderId !== job.id || (claimed.sourceGeneration?.toISOString() ?? null) !== (job.sourceGeneration ?? null)) return false
      }
      const [parent] = await tx.select().from(workOrders).where(eq(workOrders.id, job.id)).for('update')
      if (!parent?.isCurrent || !parent.servicem8Active || parent.servicem8Status !== 'Work Order' || parent.servicem8JobUuid !== job.sourceId || parent.jobDescription !== job.description) return false
      if ((parent.lastServiceM8SyncedAt?.toISOString() ?? null) !== (job.sourceGeneration ?? null)) return false
      const installerRows = await tx.select({ id: workOrderInstallers.id, name: workOrderInstallers.displayName }).from(workOrderInstallers).where(eq(workOrderInstallers.isActive, true)).orderBy(asc(workOrderInstallers.id)).for('share')
      if (!isDeepStrictEqual(installerRows.map((row, i) => ({ ...row, token: `i${i}` })), job.installers ?? [])) return false
      const items = await tx.select().from(workOrderItems).where(and(eq(workOrderItems.workOrderId, job.id), eq(workOrderItems.isActive, true))).orderBy(asc(workOrderItems.id)).for('update')
      if (items.length !== job.items.length || items.some(item => !job.items.some(source => source.id === item.id && source.description === item.originalDescription))) return false
      // Compare-and-swap the assessment snapshot as well as source generation:
      // a late response cannot replace a sibling result prepared from newer text.
      if (items.some(item => !isDeepStrictEqual(readStoredAssessment(item.dashboardAssessment), job.items.find(source => source.id === item.id)!.stored))) return false
      for (const item of items) {
        const next = values[item.id]
        if (!next || !readStoredAssessment(next)) throw new Error('Missing or invalid assessment product.')
        const before = readStoredAssessment(item.dashboardAssessment)
        await tx.update(workOrderItems).set({ dashboardAssessment: { ...next } }).where(eq(workOrderItems.id, item.id))
        if (!before || before.sourceHash !== next.sourceHash || before.state !== next.state || before.rules !== next.rules || before.model !== next.model || before.error !== next.error || !isDeepStrictEqual(before.result, next.result) || !isDeepStrictEqual(before.operational, next.operational)) {
          await tx.insert(workOrderEvents).values({ workOrderId: job.id, workOrderItemId: item.id, actorId, fieldName: 'dashboard_evidence_assessed',
            previousValue: before, newValue: next, isClientVisibleCandidate: false })
        }
      }
      await publishAssessmentClaim(tx, job, values)
      return true
    })
  },
  async fail(job, checkedAt, actorId, message) {
    const values: Record<string, StoredAssessment> = {}
    for (const item of job.items) values[item.id] = { state: 'failed', sourceHash: item.stored?.sourceHash ?? '', snapshotHash: item.stored?.snapshotHash ?? '',
      rules: ASSESSMENT_RULES, model: item.stored?.model ?? '', checkedAt, assessedAt: item.stored?.assessedAt ?? null, result: item.stored?.result ?? null,
      ...(item.stored?.operational ? { operational: item.stored.operational } : {}), coverage: item.stored?.coverage, sourceGeneration: job.sourceGeneration ?? null,
      installerVersion: item.stored?.installerVersion, sourcePolicy: item.stored?.sourcePolicy,
      error: message ?? 'Evidence assessment could not finish. Previous suggestions are retained for review; manual values are unchanged.' }
    await store.save(job, values, actorId)
  },
  }
  return store
}
export const assessmentStore = createAssessmentStore()
