ALTER TABLE "quote_movement_records"
  ADD COLUMN IF NOT EXISTS "last_servicem8_source_checkpoint_at" timestamptz;
