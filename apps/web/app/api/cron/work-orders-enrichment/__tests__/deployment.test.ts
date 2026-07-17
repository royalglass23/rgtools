import { describe, expect, it } from 'vitest'

import vercelConfig from '../../../../../vercel.json'

describe('Work Order enrichment deployment', () => {
  it('schedules the durable enrichment worker', () => {
    expect(vercelConfig.crons).toContainEqual({
      path: '/api/cron/work-orders-enrichment',
      schedule: '* * * * *',
    })
  })
})
