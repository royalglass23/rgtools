import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import {
  quoteMovementRecords,
  quoteMovementRefreshRuns,
} from '@rgtools/db/schema-quote-movement'

describe('Quote Movement persistence', () => {
  it('uses the ServiceM8 job UUID as the stable cached-list identity', () => {
    const config = getTableConfig(quoteMovementRecords)

    expect(config.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'servicem8_job_uuid',
      'servicem8_company_uuid',
      'servicem8_status',
      'servicem8_active',
      'job_number',
      'customer_name',
      'job_address',
      'quote_value_excluding_gst',
      'source_updated_at',
      'last_servicem8_synced_at',
    ]))
    expect(config.indexes.find((index) => (
      index.config.name === 'quote_movement_records_servicem8_job_uuid_uq'
    ))?.config.unique).toBe(true)
  })

  it('keeps refresh outcomes separate from the cached quote rows', () => {
    const config = getTableConfig(quoteMovementRefreshRuns)

    expect(config.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'actor_id',
      'status',
      'synced_count',
      'error_message',
      'created_at',
    ]))
  })
})
