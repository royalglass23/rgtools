ALTER TABLE "quote_movement_refresh_runs"
  ADD COLUMN IF NOT EXISTS "batch_run_id" uuid;

CREATE INDEX IF NOT EXISTS "quote_movement_refresh_runs_batch_run_id_idx"
  ON "quote_movement_refresh_runs" USING btree ("batch_run_id");
