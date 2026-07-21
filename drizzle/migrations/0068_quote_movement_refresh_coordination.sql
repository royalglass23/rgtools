ALTER TABLE "quote_movement_refresh_runs"
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;

UPDATE "quote_movement_refresh_runs"
SET "completed_at" = "created_at"
WHERE "completed_at" IS NULL
  AND "status" IN ('success', 'failed');

CREATE TABLE IF NOT EXISTS "quote_movement_refresh_locks" (
  "lock_name" text PRIMARY KEY NOT NULL,
  "owner_id" uuid NOT NULL,
  "lease_expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
