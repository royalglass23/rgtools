CREATE TABLE IF NOT EXISTS "work_order_existing_item_rollout_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"correlation_id" text NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"active_run_key" boolean,
	"total_count" integer DEFAULT 0 NOT NULL,
	"queued_count" integer DEFAULT 0 NOT NULL,
	"processing_count" integer DEFAULT 0 NOT NULL,
	"drafted_count" integer DEFAULT 0 NOT NULL,
	"needs_review_count" integer DEFAULT 0 NOT NULL,
	"unmapped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"retried_count" integer DEFAULT 0 NOT NULL,
	"skipped_removed_count" integer DEFAULT 0 NOT NULL,
	"skipped_confirmed_count" integer DEFAULT 0 NOT NULL,
	"skipped_current_key_count" integer DEFAULT 0 NOT NULL,
	"safe_failure_class" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "work_order_item_enrichment_jobs"
	ADD COLUMN IF NOT EXISTS "rollout_run_id" uuid;

DO $$ BEGIN
 ALTER TABLE "work_order_existing_item_rollout_runs"
  ADD CONSTRAINT "work_order_existing_item_rollout_runs_actor_id_users_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "work_order_item_enrichment_jobs"
  ADD CONSTRAINT "work_order_item_enrichment_jobs_rollout_run_id_work_order_existing_item_rollout_runs_id_fk"
  FOREIGN KEY ("rollout_run_id") REFERENCES "public"."work_order_existing_item_rollout_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "work_order_existing_item_rollout_runs_correlation_uq"
	ON "work_order_existing_item_rollout_runs" USING btree ("correlation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "work_order_existing_item_rollout_runs_active_uq"
	ON "work_order_existing_item_rollout_runs" USING btree ("active_run_key");
CREATE INDEX IF NOT EXISTS "work_order_existing_item_rollout_runs_started_idx"
	ON "work_order_existing_item_rollout_runs" USING btree ("started_at");
CREATE INDEX IF NOT EXISTS "work_order_item_enrichment_jobs_rollout_run_idx"
	ON "work_order_item_enrichment_jobs" USING btree ("rollout_run_id");
