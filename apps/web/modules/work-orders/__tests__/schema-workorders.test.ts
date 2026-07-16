import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import {
  workOrderEvents,
  workOrderItemProductionSpecificationRevisions,
  workOrderItemProductionSpecifications,
  workOrderItems,
  workOrderRefreshLocks,
  workOrderRefreshRuns,
  workOrderSpecificationCatalogueOptions,
} from '@rgtools/db/schema-workorders'

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
      'actor_id',
      'synced_count',
      'item_synced_count',
      'excluded_line_count',
      'error_message',
    ]))
  })

  it('stores a lease for durable refresh coordination', () => {
    const config = getTableConfig(workOrderRefreshLocks)

    expect(config.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'lock_name',
      'owner_id',
      'lease_expires_at',
      'updated_at',
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

describe('Work Order Item Production Specification persistence', () => {
  it('keeps one current draft, one confirmed baseline, and immutable revisions beside the stable item identity', () => {
    const specification = getTableConfig(workOrderItemProductionSpecifications)
    const revision = getTableConfig(workOrderItemProductionSpecificationRevisions)
    const catalogue = getTableConfig(workOrderSpecificationCatalogueOptions)

    expect(specification.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'work_order_item_id',
      'status',
      'schema_version',
      'draft_data',
      'confirmed_data',
      'production_label',
      'draft_updated_by',
      'confirmed_by',
      'confirmed_at',
    ]))
    expect(specification.indexes.find((index) => (
      index.config.name === 'work_order_item_production_specifications_item_uq'
    ))?.config.unique).toBe(true)
    expect(revision.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'specification_id',
      'work_order_item_id',
      'actor_id',
      'revision_type',
      'previous_snapshot',
      'new_snapshot',
      'reason_code',
      'note',
    ]))
    expect(catalogue.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'id',
      'field_name',
      'display_label',
      'production_label',
      'aliases',
      'ps_category_slug',
      'ps_option_slug',
      'ps1_applicable',
      'ps3_applicable',
      'is_active',
    ]))
  })
})
