-- Custom SQL migration file, put your code below! --
ALTER TABLE "quote_movement_records"
  ADD COLUMN IF NOT EXISTS "latest_activity_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "source_coverage" text DEFAULT 'incomplete' NOT NULL,
  ADD COLUMN IF NOT EXISTS "source_discovered_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "source_unread_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "source_unsupported_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "source_failed_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "source_coverage_details" jsonb DEFAULT '[]'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS "quote_movement_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "quote_movement_record_id" uuid NOT NULL REFERENCES "quote_movement_records"("id") ON DELETE cascade,
  "source_type" text NOT NULL,
  "source_identity" text NOT NULL,
  "occurred_at" timestamp with time zone,
  "interpretation_status" text NOT NULL,
  "content" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "safe_error" text,
  "first_discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "quote_movement_sources_identity_uq"
  ON "quote_movement_sources" USING btree (
    "quote_movement_record_id",
    "source_type",
    "source_identity"
  );

CREATE INDEX IF NOT EXISTS "quote_movement_sources_record_occurred_idx"
  ON "quote_movement_sources" USING btree ("quote_movement_record_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "quote_movement_sources_interpretation_status_idx"
  ON "quote_movement_sources" USING btree ("interpretation_status");

CREATE INDEX IF NOT EXISTS "quote_movement_records_latest_activity_at_idx"
  ON "quote_movement_records" USING btree ("latest_activity_at");
