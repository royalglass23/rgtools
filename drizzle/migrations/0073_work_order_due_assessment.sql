ALTER TABLE "work_order_items" ADD COLUMN "dashboard_assessment" jsonb DEFAULT '{}'::jsonb NOT NULL;
