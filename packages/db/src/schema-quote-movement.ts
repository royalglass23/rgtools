import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

export const quoteMovementProjectComplexityEnum = pgEnum(
  "quote_movement_project_complexity",
  ["unassessed", "easy", "normal", "tight", "very_difficult"],
);
export type QuoteMovementProjectComplexity =
  (typeof quoteMovementProjectComplexityEnum.enumValues)[number];

export type QuoteMovementSummaryStatement = {
  text: string;
  evidenceSourceIdentities: string[];
};

export type QuoteMovementImportantDetailsSummary = {
  currentPosition: QuoteMovementSummaryStatement;
  materialFacts: QuoteMovementSummaryStatement[];
  importantDates: QuoteMovementSummaryStatement[];
  participants: QuoteMovementSummaryStatement[];
  unresolvedMatters: QuoteMovementSummaryStatement[];
  latestMeaningfulMovement: QuoteMovementSummaryStatement | null;
  consentState:
    | (QuoteMovementSummaryStatement & {
        status:
          | "resolved_not_required"
          | "resolved_approved"
          | "unresolved_awaiting_confirmation";
      })
    | null;
};

export const quoteMovementRecords = pgTable(
  "quote_movement_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    servicem8JobUuid: text("servicem8_job_uuid").notNull(),
    servicem8CompanyUuid: text("servicem8_company_uuid"),
    servicem8Status: text("servicem8_status").notNull(),
    servicem8Active: boolean("servicem8_active").default(true).notNull(),
    jobNumber: text("job_number"),
    customerName: text("customer_name").notNull(),
    jobAddress: text("job_address"),
    quoteValueExcludingGst: numeric("quote_value_excluding_gst", {
      precision: 12,
      scale: 2,
    }),
    projectComplexity: quoteMovementProjectComplexityEnum("project_complexity")
      .default("unassessed")
      .notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    latestActivityAt: timestamp("latest_activity_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    sourceCoverage: text("source_coverage").default("incomplete").notNull(),
    sourceDiscoveredCount: integer("source_discovered_count")
      .default(0)
      .notNull(),
    sourceUnreadCount: integer("source_unread_count").default(0).notNull(),
    sourceUnsupportedCount: integer("source_unsupported_count")
      .default(0)
      .notNull(),
    sourceFailedCount: integer("source_failed_count").default(0).notNull(),
    sourceCoverageDetails: jsonb("source_coverage_details")
      .$type<string[]>()
      .default([])
      .notNull(),
    importantDetailsSummary: jsonb(
      "important_details_summary",
    ).$type<QuoteMovementImportantDetailsSummary>(),
    summarySourceFingerprint: text("summary_source_fingerprint"),
    summaryGeneratedAt: timestamp("summary_generated_at", {
      withTimezone: true,
    }),
    summaryLastAttemptedAt: timestamp("summary_last_attempted_at", {
      withTimezone: true,
    }),
    summaryLastError: text("summary_last_error"),
    lastServiceM8SyncedAt: timestamp("last_servicem8_synced_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("quote_movement_records_servicem8_job_uuid_uq").on(
      table.servicem8JobUuid,
    ),
    index("quote_movement_records_active_status_idx").on(
      table.servicem8Active,
      table.servicem8Status,
    ),
    index("quote_movement_records_job_number_idx").on(table.jobNumber),
    index("quote_movement_records_source_updated_at_idx").on(
      table.sourceUpdatedAt,
    ),
    index("quote_movement_records_latest_activity_at_idx").on(
      table.latestActivityAt,
    ),
  ],
);

export const quoteMovementSources = pgTable(
  "quote_movement_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteMovementRecordId: uuid("quote_movement_record_id")
      .notNull()
      .references(() => quoteMovementRecords.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceIdentity: text("source_identity").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    content: jsonb("content")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    firstDiscoveredAt: timestamp("first_discovered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("quote_movement_sources_identity_uq").on(
      table.quoteMovementRecordId,
      table.sourceIdentity,
    ),
    index("quote_movement_sources_record_occurred_idx").on(
      table.quoteMovementRecordId,
      table.occurredAt,
    ),
  ],
);

export const quoteMovementSourceEnrichment = pgTable(
  "quote_movement_source_enrichment",
  {
    sourceId: uuid("source_id")
      .primaryKey()
      .references(() => quoteMovementSources.id, { onDelete: "cascade" }),
    interpretationStatus: text("interpretation_status").notNull(),
    summary: text("summary"),
    safeError: text("safe_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("quote_movement_source_enrichment_status_idx").on(
      table.interpretationStatus,
    ),
  ],
);

export const quoteMovementRefreshRuns = pgTable(
  "quote_movement_refresh_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull(),
    syncedCount: integer("synced_count").default(0).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("quote_movement_refresh_runs_created_at_idx").on(table.createdAt),
    index("quote_movement_refresh_runs_status_idx").on(table.status),
  ],
);
