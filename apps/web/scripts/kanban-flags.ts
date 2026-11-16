import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadEnvConfig } from '@next/env'

async function main() {
  const args = process.argv.slice(2), value = (name: string) => args[args.indexOf(name) + 1]
  const target = value('--target'), input = value('--input'), output = value('--output'), apply = args.includes('--apply')
  if (!args.includes('--target') || !['prod', 'configured', 'local'].includes(target) || !args.includes('--input') || !input || (apply && (!args.includes('--expected-plan') || !value('--expected-plan')))) throw new Error('Use --target prod|configured|local --input <manifest.json> [--output <preview.json>] [--apply --expected-plan <hash>].')
  loadEnvConfig(path.resolve(process.cwd(), process.cwd().endsWith(path.join('apps', 'web')) ? '../..' : '.'))
  const selected = target === 'prod' ? process.env.DB_URL_PROD : process.env.DATABASE_URL
  if (!selected) throw new Error('Selected database is not configured.')
  if (target === 'local' && new URL(selected).hostname !== '127.0.0.1') throw new Error('The local target requires the isolated loopback database.')
  process.env.DATABASE_URL = selected
  const { previewKanbanFlags, applyKanbanFlags } = await import('../modules/kanban/kanban-flag-import')
  const raw = JSON.parse(readFileSync(path.resolve(input), 'utf8'))
  if (apply) {
    const { withWorkOrderRefreshLock } = await import('../modules/work-orders/refresh-lock')
    const result = await withWorkOrderRefreshLock(() => applyKanbanFlags(raw, value('--expected-plan')))
    console.log(JSON.stringify({ target, ...result, manualFieldsChanged: false, serviceM8Writes: 0 }))
  } else {
    const plan = await previewKanbanFlags(raw)
    if (args.includes('--output')) writeFileSync(path.resolve(output), JSON.stringify(plan, null, 2))
    console.log(JSON.stringify({ target, preview: true, planHash: plan.planHash, matchedJobs: plan.matched.length, unmatched: plan.unmatched, ambiguous: plan.ambiguous,
      includedJobs: plan.matched.filter(job => job.flag === 'Y').length, includedProducts: plan.matched.filter(job => job.flag === 'Y').reduce((n, job) => n + job.products, 0),
      productOverrides: plan.matched.reduce((n, job) => n + job.overrides, 0) }))
  }
}
main().catch(error => { console.error(error instanceof Error && !/password|postgres|query|connection/i.test(error.message) ? error.message : 'Flag import could not finish.'); process.exitCode = 1 })
