/** Preview only. Deliberately has no apply/write mode. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

async function main() {
  const args = process.argv.slice(2)
  const input = args[args.indexOf('--input-dir') + 1]
  if (!args.includes('--dry-run') || !args.includes('--input-dir') || !input || args.includes('--apply')) throw new Error('Use --dry-run --input-dir <folder>. Import writes are not supported.')
  const script = fileURLToPath(new URL('./legacy-kanban.py', import.meta.url))
  const extracted = spawnSync(process.env.RGTOOLS_PYTHON ?? 'python', [script, path.resolve(input)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60000 })
  if (extracted.status !== 0) throw new Error('Legacy extraction failed. Set RGTOOLS_PYTHON to a Python 3 executable. Source files were not changed.')
  const report = JSON.parse(extracted.stdout)
  let sourceRows: Array<{ jobNumber: string | null; id: string; itemId: string | null; label: string | null }> = []
  if (!args.includes('--offline')) {
    const { db } = await import('../../../packages/db/src/client')
    const { workOrders, workOrderItems } = await import('../../../packages/db/src/schema-workorders')
    const { eq } = await import('drizzle-orm')
    sourceRows = await db.select({ jobNumber: workOrders.jobNumber, id: workOrders.id, itemId: workOrderItems.id, label: workOrderItems.originalDescription })
      .from(workOrders).leftJoin(workOrderItems, eq(workOrderItems.workOrderId, workOrders.id)).limit(10001)
    if (sourceRows.length > 10000) throw new Error('Source match inventory exceeded its safe limit; no partial match report was written.')
  }
  for (const record of report.manualValues) {
    const candidates = sourceRows.filter(row => row.jobNumber === record.jobNumber && (!record.item || row.label === record.item))
    record.candidateItemIds = Array.from(new Set(candidates.flatMap(row => row.itemId ? [row.itemId] : [])))
    record.reason = record.candidateItemIds.length === 1 ? 'Candidate needs field/source and newer-edit review before import.' : 'Job/product mapping needs review; no automatic match.'
    record.identity = createHash('sha256').update(JSON.stringify([record.file, record.sheet, record.cell, record.jobNumber, record.item, record.field, record.value])).digest('hex')
  }
  const output = path.resolve(process.cwd(), '../../tmp/rg406-import-preview.json')
  mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2))
  const tableB = report.manualValues.filter((r: { sheet: string }) => r.sheet === 'Table B')
  console.log(JSON.stringify({ dryRun: true, files: report.files.length, manualValues: report.manualValues.length,
    tableBProducts: new Set(tableB.map((r: { jobNumber: string; item: string }) => r.jobNumber + '\0' + r.item)).size,
    tableBJobs: new Set(tableB.map((r: { jobNumber: string }) => r.jobNumber)).size,
    unresolvedValues: report.manualValues.length, report: output }))
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1) })
