ALTER TABLE "quote_movement_refresh_runs"
  ADD COLUMN IF NOT EXISTS "job_number" text;

CREATE INDEX IF NOT EXISTS "quote_movement_refresh_runs_job_number_idx"
  ON "quote_movement_refresh_runs" USING btree ("job_number");
