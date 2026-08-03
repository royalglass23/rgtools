ALTER TABLE "work_order_item_production_specifications"
  ADD COLUMN "source_description" text,
  ADD COLUMN "draft_source_description_fingerprint" text,
  ADD COLUMN "draft_source_description" text,
  ADD COLUMN "ignored_source_description_fingerprint" text,
  ADD COLUMN "confirmed_revision" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "draft_revision" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "draft_base_revision" integer;

ALTER TABLE "work_order_item_production_specification_revisions"
  ADD COLUMN "changes" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "work_order_item_production_specifications" AS specifications
SET
  "draft_source_description" = CASE
    WHEN specifications."draft_data" IS NOT NULL THEN items."original_description"
    ELSE NULL
  END,
  "draft_source_description_fingerprint" = CASE
    WHEN specifications."draft_data" IS NOT NULL THEN specifications."source_description_fingerprint"
    ELSE NULL
  END,
  "confirmed_revision" = CASE
    WHEN specifications."confirmed_data" IS NOT NULL THEN 1
    ELSE 0
  END,
  "draft_revision" = CASE
    WHEN specifications."draft_data" IS NOT NULL THEN 1
    ELSE 0
  END,
  "draft_base_revision" = CASE
    WHEN specifications."draft_data" IS NOT NULL AND specifications."confirmed_data" IS NOT NULL THEN 1
    WHEN specifications."draft_data" IS NOT NULL THEN 0
    ELSE NULL
  END
FROM "work_order_items" AS items
WHERE items."id" = specifications."work_order_item_id";
