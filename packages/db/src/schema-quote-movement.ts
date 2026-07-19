import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './schema'

export const quoteMovementRecords = pgTable('quote_movement_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  servicem8JobUuid: text('servicem8_job_uuid').notNull(),
  servicem8CompanyUuid: text('servicem8_company_uuid'),
  servicem8Status: text('servicem8_status').notNull(),
  servicem8Active: boolean('servicem8_active').default(true).notNull(),
  jobNumber: text('job_number'),
  customerName: text('customer_name').notNull(),
  jobAddress: text('job_address'),
  quoteValueExcludingGst: numeric('quote_value_excluding_gst', { precision: 12, scale: 2 }),
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
  lastServiceM8SyncedAt: timestamp('last_servicem8_synced_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('quote_movement_records_servicem8_job_uuid_uq').on(table.servicem8JobUuid),
  index('quote_movement_records_active_status_idx').on(table.servicem8Active, table.servicem8Status),
  index('quote_movement_records_job_number_idx').on(table.jobNumber),
  index('quote_movement_records_source_updated_at_idx').on(table.sourceUpdatedAt),
])

export const quoteMovementRefreshRuns = pgTable('quote_movement_refresh_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull(),
  syncedCount: integer('synced_count').default(0).notNull(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('quote_movement_refresh_runs_created_at_idx').on(table.createdAt),
  index('quote_movement_refresh_runs_status_idx').on(table.status),
])
