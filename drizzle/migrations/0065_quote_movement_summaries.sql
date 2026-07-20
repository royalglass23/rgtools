ALTER TABLE "quote_movement_records"
  ADD COLUMN IF NOT EXISTS "important_details_summary" jsonb,
  ADD COLUMN IF NOT EXISTS "summary_source_fingerprint" text,
  ADD COLUMN IF NOT EXISTS "summary_generated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "summary_last_attempted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "summary_last_error" text;
