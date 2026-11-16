import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrders, workOrderItems, workOrderEvents } from '@rgtools/db/schema-workorders'
import { ASSESSMENT_RULES, readStoredAssessment, type AssessmentJob, type AssessmentStore, type StoredAssessment } from './assessment'

export const assessmentStore: AssessmentStore = {
  async list() {
    const rows = await db.select({ id: workOrderItems.id, workOrderId: workOrders.id, sourceId: workOrders.servicem8JobUuid,
      customer: workOrders.clientName, address: workOrders.jobAddress, jobDescription: workOrders.jobDescription,
      label: workOrderItems.manualLabelOverride, description: workOrderItems.originalDescription, stored: workOrderItems.dashboardAssessment,
    }).from(workOrders).innerJoin(workOrderItems, and(eq(workOrderItems.workOrderId, workOrders.id), eq(workOrderItems.isActive, true)))
      .where(and(eq(workOrders.isCurrent, true), eq(workOrders.servicem8Active, true), eq(workOrders.servicem8Status, 'Work Order')))
      .orderBy(asc(workOrders.id), asc(workOrderItems.id)).limit(10001)
    if (rows.length > 10000) throw new Error('Assessment inventory exceeds its bounded limit.')
    const jobs = new Map<string, AssessmentJob>()
    for (const row of rows) {
      if (!row.sourceId) continue
      const job = jobs.get(row.workOrderId) ?? { id: row.workOrderId, sourceId: row.sourceId, customer: row.customer, address: row.address, description: row.jobDescription, items: [] }
      job.items.push({ id: row.id, label: row.label ?? row.description, description: row.description, stored: readStoredAssessment(row.stored) })
      jobs.set(job.id, job)
    }
    const oldest = (job: AssessmentJob) => job.items.map(item => item.stored?.checkedAt ?? '').sort()[0]
    return [...jobs.values()].sort((a, b) => oldest(a).localeCompare(oldest(b)))
  },
  async save(job, values, actorId) {
    return db.transaction(async tx => {
      const [parent] = await tx.select().from(workOrders).where(eq(workOrders.id, job.id)).for('update')
      if (!parent?.isCurrent || !parent.servicem8Active || parent.servicem8Status !== 'Work Order' || parent.servicem8JobUuid !== job.sourceId || parent.jobDescription !== job.description) return false
      const items = await tx.select().from(workOrderItems).where(and(eq(workOrderItems.workOrderId, job.id), eq(workOrderItems.isActive, true))).orderBy(asc(workOrderItems.id)).for('update')
      if (items.length !== job.items.length || items.some(item => !job.items.some(source => source.id === item.id && source.description === item.originalDescription))) return false
      for (const item of items) {
        const next = values[item.id]
        if (!next) throw new Error('Missing assessment product.')
        const before = readStoredAssessment(item.dashboardAssessment)
        await tx.update(workOrderItems).set({ dashboardAssessment: { ...next } }).where(eq(workOrderItems.id, item.id))
        if (!before || before.sourceHash !== next.sourceHash || before.state !== next.state || before.rules !== next.rules || before.model !== next.model || before.error !== next.error || JSON.stringify(before.result) !== JSON.stringify(next.result)) {
          await tx.insert(workOrderEvents).values({ workOrderId: job.id, workOrderItemId: item.id, actorId, fieldName: 'dashboard_evidence_assessed',
            previousValue: before, newValue: next, isClientVisibleCandidate: false })
        }
      }
      return true
    })
  },
  async fail(job, checkedAt, actorId, message) {
    const values: Record<string, StoredAssessment> = {}
    for (const item of job.items) values[item.id] = { state: 'failed', sourceHash: item.stored?.sourceHash ?? '', snapshotHash: item.stored?.snapshotHash ?? '',
      rules: ASSESSMENT_RULES, model: item.stored?.model ?? '', checkedAt, assessedAt: item.stored?.assessedAt ?? null, result: item.stored?.result ?? null,
      error: message ?? 'Evidence assessment could not finish. Previous suggestions are retained for review; manual values are unchanged.' }
    await this.save(job, values, actorId)
  },
}
