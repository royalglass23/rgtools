import { createHash } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@rgtools/db/schema'
import { workOrders, workOrderItems, workOrderEvents } from '@rgtools/db/schema-workorders'
import { KANBAN_FLAGS_SETTING, parseFlagManifest, planFlagImport, readImportedFlags, type FlagManifest, type ImportedFlagState, type ImportedKanbanFlag } from './kanban-flags'

type Database = Pick<typeof db, 'transaction'>
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function previewKanbanFlags(raw: unknown, database: Database = db) {
  const manifest = parseFlagManifest(raw)
  return database.transaction(async tx => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`)
    const inventory = await tx.select({ id: workOrders.id, jobNumber: workOrders.jobNumber, jobUuid: workOrders.servicem8JobUuid,
      products: sql<number>`count(${workOrderItems.id})::int`, overrides: sql<number>`count(${workOrderItems.id}) FILTER (WHERE coalesce(${workOrderItems.dashboardState}->>'focus','auto') <> 'auto')::int`,
    }).from(workOrders).leftJoin(workOrderItems, and(eq(workOrderItems.workOrderId, workOrders.id), eq(workOrderItems.isActive, true)))
      .where(and(eq(workOrders.isCurrent, true), eq(workOrders.servicem8Active, true), eq(workOrders.servicem8Status, 'Work Order'))).groupBy(workOrders.id).orderBy(asc(workOrders.id)).limit(10001)
    if (inventory.length > 10000) throw new Error('Flag inventory exceeded its bounded limit.')
    const [row] = await tx.select({ value: settings.value }).from(settings).where(eq(settings.key, KANBAN_FLAGS_SETTING))
    return makePlan(manifest, inventory, readImportedFlags(row?.value))
  })
}
function makePlan(manifest: FlagManifest, inventory: Parameters<typeof planFlagImport>[1], prior: ImportedFlagState) {
  const mapping = planFlagImport(manifest, inventory)
  const sourceHash = digest({ version: manifest.version, source: { ...manifest.source, retrievedAt: undefined }, rows: manifest.rows })
  return { ...mapping, sourceHash, planHash: digest({ sourceHash, mapping, prior }), prior }
}
export async function applyKanbanFlags(raw: unknown, expectedPlan: string, actorId: string | null = null, database: Database = db) {
  const manifest = parseFlagManifest(raw)
  if (!/^[a-f0-9]{64}$/.test(expectedPlan)) throw new Error('The exact preview plan hash is required.')
  return database.transaction(async tx => {
    // Lock identities first, consistent with assessment persistence. The settings
    // row then serializes imports without touching any product-owned fields.
    const jobs = await tx.select({ id: workOrders.id, jobNumber: workOrders.jobNumber, jobUuid: workOrders.servicem8JobUuid }).from(workOrders)
      .where(and(eq(workOrders.isCurrent, true), eq(workOrders.servicem8Active, true), eq(workOrders.servicem8Status, 'Work Order'))).orderBy(asc(workOrders.id)).limit(10001).for('update')
    if (jobs.length > 10000) throw new Error('Flag inventory exceeded its bounded limit.')
    await tx.insert(settings).values({ key: KANBAN_FLAGS_SETTING, value: JSON.stringify({ version: 1, entries: {} }) }).onConflictDoNothing({ target: settings.key })
    const [row] = await tx.select().from(settings).where(eq(settings.key, KANBAN_FLAGS_SETTING)).for('update')
    const items = await tx.select({ jobId: workOrderItems.workOrderId, manual: workOrderItems.dashboardState }).from(workOrderItems).where(eq(workOrderItems.isActive, true)).limit(100001)
    if (items.length > 100000) throw new Error('Product inventory exceeded its bounded limit.')
    const inventory = jobs.map(job => ({ ...job, products: items.filter(item => item.jobId === job.id).length,
      overrides: items.filter(item => item.jobId === job.id && item.manual.focus && item.manual.focus !== 'auto').length }))
    const plan = makePlan(manifest, inventory, readImportedFlags(row?.value))
    if (plan.planHash !== expectedPlan) throw new Error('The import preview changed. Generate a fresh preview before applying.')
    if (plan.unmatched.length || plan.ambiguous.length) throw new Error('Resolve all unmatched or ambiguous jobs before applying flags.')
    const entries = { ...plan.prior.entries }, importedAt = new Date().toISOString()
    let applied = 0
    for (const match of plan.matched) {
      const previous = entries[match.jobId] ?? null
      if (previous?.sourceHash === plan.sourceHash && previous.flag === match.flag && previous.jobUuid === match.jobUuid && previous.sourceCell === match.sourceCell) continue
      const next: ImportedKanbanFlag = { jobId: match.jobId, jobNumber: match.jobNumber, jobUuid: match.jobUuid, flag: match.flag,
        sourceCell: match.sourceCell, source: manifest.source, sourceHash: plan.sourceHash, importedAt }
      entries[match.jobId] = next
      await tx.insert(workOrderEvents).values({ workOrderId: match.jobId, actorId, fieldName: 'dashboard_kanban_flag_imported', previousValue: previous, newValue: next,
        note: 'Imported the Master Within 3 weeks flag at staff request. Product overrides and manual fields were not changed.', isClientVisibleCandidate: false })
      applied++
    }
    if (applied) await tx.update(settings).set({ value: JSON.stringify({ version: 1, entries }), updatedBy: actorId, updatedAt: new Date() }).where(eq(settings.id, row.id))
    return { applied, unchanged: plan.matched.length - applied, sourceHash: plan.sourceHash, includedJobs: plan.matched.filter(job => job.flag === 'Y').length,
      includedProducts: plan.matched.filter(job => job.flag === 'Y').reduce((total, job) => total + job.products, 0), productOverrides: plan.matched.reduce((total, job) => total + job.overrides, 0) }
  })
}
