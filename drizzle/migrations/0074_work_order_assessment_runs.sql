CREATE TABLE "work_order_assessment_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot" text NOT NULL,
	"requester_id" uuid,
	"state" text DEFAULT 'active' NOT NULL,
	"rules" text NOT NULL,
	"model" text NOT NULL,
	"schema_version" integer NOT NULL,
	"source_policy" text NOT NULL,
	"total_jobs" integer DEFAULT 0 NOT NULL,
	"completed_jobs" integer DEFAULT 0 NOT NULL,
	"pending_jobs" integer DEFAULT 0 NOT NULL,
	"failed_jobs" integer DEFAULT 0 NOT NULL,
	"unavailable_jobs" integer DEFAULT 0 NOT NULL,
	"assessed_products" integer DEFAULT 0 NOT NULL,
	"reused_products" integer DEFAULT 0 NOT NULL,
	"review_products" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"source_synced_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_assessment_work" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"source_generation" timestamp with time zone,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"executor_id" uuid,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessed_products" integer DEFAULT 0 NOT NULL,
	"reused_products" integer DEFAULT 0 NOT NULL,
	"review_products" integer DEFAULT 0 NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_order_assessment_runs" ADD CONSTRAINT "work_order_assessment_runs_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assessment_work" ADD CONSTRAINT "work_order_assessment_work_run_id_work_order_assessment_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."work_order_assessment_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assessment_work" ADD CONSTRAINT "work_order_assessment_work_executor_id_users_id_fk" FOREIGN KEY ("executor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_order_assessment_runs_created_idx" ON "work_order_assessment_runs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_assessment_work_run_job_uq" ON "work_order_assessment_work" USING btree ("run_id","work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_assessment_work_claim_idx" ON "work_order_assessment_work" USING btree ("run_id","state","available_at");