import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { workOrderEvents, workOrderItems, workOrderRefreshRuns } from '@rgtools/db/schema-workorders'

describe('Work Order Item persistence', () => {
  it('separates stable ServiceM8 source values from RG-owned item tracking', () => {
    const config = getTableConfig(workOrderItems)
    const columnNames = config.columns.map((column) => column.name)

    expect(columnNames).toEqual(expect.arrayContaining([
      'work_order_id',
      'servicem8_item_uuid',
      'servicem8_job_uuid',
      'item_code',
      'quantity',
      'original_description',
      'line_total_excluding_gst',
      'generated_label',
      'manual_label_override',
      'label_status',
      'source_description_fingerprint',
      'installer_id',
      'stage_option_id',
      'hardware_status_option_id',
      'maintenance_program',
      'install_date',
      'date_completed',
      'ai_risk_level',
      'risk_level_override',
      'ai_importance',
      'importance_override',
    ]))

    const identityIndex = config.indexes.find(
      (index) => index.config.name === 'work_order_items_servicem8_item_uuid_uq',
    )
    expect(identityIndex?.config.unique).toBe(true)
    expect(config.foreignKeys).toHaveLength(4)
  })
})

describe('Work Order refresh run persistence', () => {
  it('stores job, item, and excluded-line counts for freshness reporting', () => {
    const columnNames = getTableConfig(workOrderRefreshRuns).columns.map((column) => column.name)

    expect(columnNames).toEqual(expect.arrayContaining([
      'synced_count',
      'item_synced_count',
      'excluded_line_count',
      'error_message',
    ]))
  })
})

describe('Work Order Item audit persistence', () => {
  it('links an audit event to its affected item without requiring parent events to have one', () => {
    const config = getTableConfig(workOrderEvents)

    expect(config.columns.map((column) => column.name)).toContain('work_order_item_id')
    expect(config.foreignKeys.some((foreignKey) => (
      foreignKey.reference().foreignTable === workOrderItems
    ))).toBe(true)
    expect(config.indexes.some((index) => (
      index.config.name === 'work_order_events_work_order_item_idx'
    ))).toBe(true)
  })
})
