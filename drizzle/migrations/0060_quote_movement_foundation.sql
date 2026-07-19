CREATE TABLE IF NOT EXISTS "quote_movement_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"servicem8_job_uuid" text NOT NULL,
	"servicem8_company_uuid" text,
	"servicem8_status" text NOT NULL,
	"servicem8_active" boolean DEFAULT true NOT NULL,
	"job_number" text,
	"customer_name" text NOT NULL,
	"job_address" text,
	"quote_value_excluding_gst" numeric(12, 2),
	"source_updated_at" timestamp with time zone,
	"last_servicem8_synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "quote_movement_refresh_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"status" text NOT NULL,
	"synced_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "quote_movement_refresh_runs" ADD CONSTRAINT "quote_movement_refresh_runs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "quote_movement_records_servicem8_job_uuid_uq" ON "quote_movement_records" USING btree ("servicem8_job_uuid");
CREATE INDEX IF NOT EXISTS "quote_movement_records_active_status_idx" ON "quote_movement_records" USING btree ("servicem8_active", "servicem8_status");
CREATE INDEX IF NOT EXISTS "quote_movement_records_job_number_idx" ON "quote_movement_records" USING btree ("job_number");
CREATE INDEX IF NOT EXISTS "quote_movement_records_source_updated_at_idx" ON "quote_movement_records" USING btree ("source_updated_at");
CREATE INDEX IF NOT EXISTS "quote_movement_refresh_runs_created_at_idx" ON "quote_movement_refresh_runs" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "quote_movement_refresh_runs_status_idx" ON "quote_movement_refresh_runs" USING btree ("status");
