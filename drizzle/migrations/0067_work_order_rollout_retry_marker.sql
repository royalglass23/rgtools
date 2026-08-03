ALTER TABLE "work_order_item_enrichment_jobs"
	ADD COLUMN IF NOT EXISTS "rollout_was_retried" boolean DEFAULT false NOT NULL;
