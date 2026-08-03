import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import vercelConfig from '../../../../../vercel.json'

describe('Work Order enrichment deployment', () => {
  it('uses the Manage job-update action instead of a Hobby-incompatible enrichment cron', () => {
    expect(vercelConfig.crons).not.toContainEqual(expect.objectContaining({
      path: '/api/cron/work-orders-enrichment',
    }))
    expect(vercelConfig.crons).toContainEqual({
      path: '/api/cron/work-orders-retention',
      schedule: '0 15 * * 0',
    })
  })

  it('documents the manual Hobby operating and retry contract', () => {
    const runbook = readFileSync(
      join(process.cwd(), '../../docs/dev/work-order-enrichment.md'),
      'utf8',
    )

    expect(runbook).toContain('No Work Order enrichment cron is scheduled')
    expect(runbook).toContain('Update job')
    expect(runbook).toContain('Refresh all jobs')
    expect(runbook).toContain('Delayed retries')
    expect(runbook).not.toContain('confirm `/api/cron/work-orders-enrichment` appears in Vercel Cron Jobs')
  })
})
