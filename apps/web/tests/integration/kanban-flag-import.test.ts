import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { eq } from 'drizzle-orm'
import { settings, users } from '@rgtools/db/schema'
import { workOrders, workOrderItems, workOrderEvents } from '@rgtools/db/schema-workorders'
import { applyKanbanFlags, previewKanbanFlags } from '@/modules/kanban/kanban-flag-import'
import { KANBAN_FLAGS_SETTING, readImportedFlags } from '@/modules/kanban/kanban-flags'

const url = process.env.RG406_TEST_DATABASE_URL
const enabled = Boolean(url && new URL(url).hostname === '127.0.0.1' && new URL(url).port === '55440' && new URL(url).pathname === '/rg406')
const jobId = crypto.randomUUID(), actorId = crypto.randomUUID(), itemIds = [crypto.randomUUID(), crypto.randomUUID()]
let pool: Pool, database: ReturnType<typeof drizzle>, previousSetting: string | undefined
const manifest = { version: 1, source: { spreadsheetId: 'synthetic-sheet-id-123456', sheetId: 1, sheet: 'Master', modifiedAt: '2026-11-16T00:00:00Z', retrievedAt: '2026-11-17T00:00:00Z', ranges: ['A1:B1000', 'AR1:AR1000'] },
  rows: [{ row: 5, jobNumber: 'FLAG406', flag: 'Y', cell: 'AR5' }] }
describe.skipIf(!enabled)('Kanban flag transfer on isolated localhost DB', () => {
  beforeAll(async () => {
    neonConfig.webSocketConstructor = WebSocket; neonConfig.wsProxy = () => '127.0.0.1:55441'; neonConfig.useSecureWebSocket = false; neonConfig.pipelineConnect = false
    pool = new Pool({ connectionString: url! }); database = drizzle(pool)
    const [setting] = await database.select().from(settings).where(eq(settings.key, KANBAN_FLAGS_SETTING)); previousSetting = setting?.value
    await database.insert(users).values({ id: actorId, username: `flags-${actorId}`, passwordHash: 'not-a-login', role: 'staff' })
    await database.insert(workOrders).values({ id: jobId, identityKind: 'servicem8_uuid', identityValue: jobId, servicem8JobUuid: jobId, servicem8Status: 'Work Order', jobNumber: 'FLAG406', clientName: 'Synthetic flag job' })
    await database.insert(workOrderItems).values(itemIds.map((id, i) => ({ id, workOrderId: jobId, servicem8JobUuid: jobId, servicem8ItemUuid: id, quantity: '1', originalDescription: i ? 'Synthetic balustrade' : 'Synthetic shower', dashboardState: i ? {} : { focus: 'exclude', siteReady: 'yes', notes: 'Preserve staff work' }, dashboardRevision: 4, installDate: i ? null : '2026-12-23' })))
  })
  afterAll(async () => {
    if (!database) return
    if (previousSetting === undefined) await database.delete(settings).where(eq(settings.key, KANBAN_FLAGS_SETTING))
    else await database.update(settings).set({ value: previousSetting, updatedBy: null }).where(eq(settings.key, KANBAN_FLAGS_SETTING))
    await database.delete(workOrders).where(eq(workOrders.id, jobId)); await database.delete(users).where(eq(users.id, actorId))
    await pool.end()
  })
  it('imports with provenance/history, preserves products, is idempotent and rejects stale plans', async () => {
    const before = await database.select().from(workOrderItems).where(eq(workOrderItems.workOrderId, jobId))
    const plan = await previewKanbanFlags(manifest, database)
    expect(plan.matched).toContainEqual(expect.objectContaining({ jobId, flag: 'Y', products: 2, overrides: 1 }))
    expect(await applyKanbanFlags(manifest, plan.planHash, actorId, database)).toMatchObject({ applied: 1, productOverrides: 1 })
    const after = await database.select().from(workOrderItems).where(eq(workOrderItems.workOrderId, jobId))
    expect(after).toEqual(before)
    const [saved] = await database.select().from(settings).where(eq(settings.key, KANBAN_FLAGS_SETTING))
    expect(readImportedFlags(saved.value).entries[jobId]).toMatchObject({ flag: 'Y', sourceCell: 'AR5', jobUuid: jobId })
    const again = await previewKanbanFlags(manifest, database)
    expect(await applyKanbanFlags(manifest, again.planHash, actorId, database)).toMatchObject({ applied: 0, unchanged: 1 })
    const events = await database.select().from(workOrderEvents).where(eq(workOrderEvents.workOrderId, jobId))
    expect(events).toHaveLength(1); expect(events[0].actorId).toBe(actorId)
    const stale = await previewKanbanFlags(manifest, database)
    await database.update(workOrders).set({ servicem8JobUuid: 'different-source' }).where(eq(workOrders.id, jobId))
    await expect(applyKanbanFlags(manifest, stale.planHash, actorId, database)).rejects.toThrow('preview changed')
    expect((await database.select().from(workOrderItems).where(eq(workOrderItems.workOrderId, jobId)))).toEqual(before)
  })
})
