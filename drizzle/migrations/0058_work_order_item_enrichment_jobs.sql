ALTER TABLE "work_order_items"
  ADD COLUMN "enrichment_handoff_pending" boolean DEFAULT false NOT NULL;

ALTER TABLE "work_order_item_production_specifications"
  ADD COLUMN "evidence_data" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "ambiguity_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "source_description_fingerprint" text,
  ADD COLUMN "extraction_schema_version" integer,
  ADD COLUMN "prompt_version" text,
  ADD COLUMN "model_identifier" text,
  ADD COLUMN "generated_at" timestamp with time zone;

INSERT INTO "work_order_specification_catalogue_options"
  ("id", "field_name", "display_label", "production_label", "aliases", "ps1_applicable", "ps3_applicable", "sort_order")
VALUES
  ('system.round-ss-rail', 'system', 'Round Stainless Steel Rail', 'Round SS Rail', '["round stainless rail","round ss rail"]', false, false, 70),
  ('system.double-disc-balustrade', 'system', 'Double Disc Balustrade', 'Double Disc Balustrade', '["double disc balustrade"]', false, false, 80),
  ('system.edgetec-posiglaze-pool-fence', 'system', 'EdgeTec PosiGlaze Pool Fence', 'EdgeTec PosiGlaze Pool Fence', '["edgetec posiglaze","posiglaze pool fence"]', false, false, 90),
  ('system.handrail-brackets', 'system', 'Handrail Brackets', 'Handrail Brackets', '["hand rail brackets"]', false, false, 100),
  ('system.pool-fence-variation', 'system', 'Pool Fence Variation', 'Pool Fence Variation', '["pool fence design change"]', false, false, 110),
  ('system.shower-screens', 'system', 'Shower Screens', 'Shower Screens', '["multi screen shower"]', false, false, 120),
  ('gate_required.one', 'gateRequired', 'One Gate', '1 Gate', '["one gate","1 gate"]', false, false, 30),
  ('door_opening_type.hinged-fixed-panel', 'doorOpeningType', 'Hinged and Fixed Panel', 'Hinged + Fixed Panel', '["hinged plus fixed panel"]', false, false, 60),
  ('door_opening_type.multi-screen', 'doorOpeningType', 'Two Single, Corner and Diamond', '2 Single + Corner + Diamond', '["two single corner diamond"]', false, false, 70),
  ('fixing_method.timber-top-mount', 'fixingMethod', 'Timber Top-Mount', 'Timber Top-Mount', '["timber top mount"]', false, false, 30),
  ('fixing_method.custom-anti-toe-hold', 'fixingMethod', 'Custom Anti-Toe-Hold Design', 'Custom Anti-Toe-Hold Design', '["anti toe hold"]', false, false, 40),
  ('finish.black', 'hardwareFinish', 'Black', 'Black', '["black hardware"]', false, false, 40),
  ('system_finish.316-ss', 'systemFinish', '316 Stainless Steel', '316 SS', '["316 stainless","316 ss"]', false, false, 20),
  ('delivery_scope.install-included', 'deliveryScope', 'Installation Included', 'Install Included', '["installation included"]', false, false, 40)
ON CONFLICT ("id") DO NOTHING;

CREATE TYPE "work_order_item_enrichment_status" AS ENUM ('queued', 'processing', 'completed', 'failed');

CREATE TABLE "work_order_item_enrichment_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "work_order_item_id" uuid NOT NULL,
  "source_description" text NOT NULL,
  "source_description_fingerprint" text NOT NULL,
  "extraction_schema_version" integer NOT NULL,
  "prompt_version" text NOT NULL,
  "status" "work_order_item_enrichment_status" DEFAULT 'queued' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "lease_expires_at" timestamp with time zone,
  "model_identifier" text,
  "last_safe_error" text,
  "generated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "work_order_item_enrichment_jobs"
  ADD CONSTRAINT "work_order_item_enrichment_jobs_work_order_item_id_work_order_items_id_fk"
  FOREIGN KEY ("work_order_item_id") REFERENCES "public"."work_order_items"("id") ON DELETE cascade;

CREATE UNIQUE INDEX "work_order_item_enrichment_jobs_key_uq"
  ON "work_order_item_enrichment_jobs" (
    "work_order_item_id",
    "source_description_fingerprint",
    "extraction_schema_version",
    "prompt_version"
  );
CREATE INDEX "work_order_item_enrichment_jobs_status_available_idx"
  ON "work_order_item_enrichment_jobs" ("status", "available_at");
CREATE INDEX "work_order_item_enrichment_jobs_item_created_idx"
  ON "work_order_item_enrichment_jobs" ("work_order_item_id", "created_at");
