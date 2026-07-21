-- Custom SQL migration file, put your code below! --
CREATE TABLE IF NOT EXISTS "work_order_refresh_locks" (
  "lock_name" text PRIMARY KEY NOT NULL,
  "owner_id" text NOT NULL,
  "lease_expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
