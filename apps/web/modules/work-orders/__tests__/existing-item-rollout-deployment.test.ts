// @vitest-environment node

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('existing-item rollout deployment contract', () => {
  it('uses additive migrations after reserved quote migrations and documents reversible staging acceptance', () => {
    const workspaceRoot = join(process.cwd(), '../..')
    const migration = readFileSync(
      join(workspaceRoot, 'drizzle/migrations/0066_work_order_existing_item_rollout.sql'),
      'utf8',
    )
    const retryMigration = readFileSync(
      join(workspaceRoot, 'drizzle/migrations/0067_work_order_rollout_retry_marker.sql'),
      'utf8',
    )
    const runbook = readFileSync(
      join(workspaceRoot, 'docs/dev/work-order-existing-item-rollout.md'),
      'utf8',
    )

    expect(`${migration}\n${retryMigration}`).not.toMatch(/\b(DROP|TRUNCATE)\b|\bDELETE\s+FROM\b/i)
    expect(runbook).toContain('0061–0065')
    expect(runbook).toContain('Catalogue seed')
    expect(runbook).toContain('Golden examples')
    expect(runbook).toContain('Explicit batch start')
    expect(runbook).toContain('Success and failure review')
    expect(runbook).toContain('Rollback')
    expect(runbook).toContain('Monitoring signals')
    expect(runbook).toContain('Observation period')
    expect(runbook).toContain('WORK_ORDER_EXISTING_ITEM_ROLLOUT_ENABLED=false')
    expect(runbook).toContain('never delete')
  })
})
