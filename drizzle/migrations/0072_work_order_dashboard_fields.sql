ALTER TABLE "work_order_items" ADD COLUMN "dashboard_state" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_order_items" ADD COLUMN "dashboard_revision" integer DEFAULT 0 NOT NULL;
