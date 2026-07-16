CREATE TYPE "public"."work_order_production_specification_status" AS ENUM('needs_review', 'confirmed');

CREATE TABLE "work_order_specification_catalogue_options" (
  "id" text PRIMARY KEY NOT NULL,
  "field_name" text NOT NULL,
  "display_label" text NOT NULL,
  "production_label" text NOT NULL,
  "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ps_category_slug" text,
  "ps_option_slug" text,
  "ps1_applicable" boolean DEFAULT false NOT NULL,
  "ps3_applicable" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "work_order_item_production_specifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "work_order_item_id" uuid NOT NULL,
  "status" "work_order_production_specification_status" DEFAULT 'needs_review' NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "draft_data" jsonb,
  "confirmed_data" jsonb,
  "production_label" text,
  "draft_updated_by" uuid,
  "draft_updated_at" timestamp with time zone,
  "confirmed_by" uuid,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "work_order_item_production_specification_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "specification_id" uuid NOT NULL,
  "work_order_item_id" uuid NOT NULL,
  "actor_id" uuid,
  "revision_type" text NOT NULL,
  "previous_snapshot" jsonb,
  "new_snapshot" jsonb NOT NULL,
  "reason_code" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "work_order_specification_catalogue_options"
  ADD CONSTRAINT "work_order_specification_catalogue_options_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "work_order_item_production_specifications"
  ADD CONSTRAINT "work_order_item_production_specifications_work_order_item_id_work_order_items_id_fk"
  FOREIGN KEY ("work_order_item_id") REFERENCES "public"."work_order_items"("id") ON DELETE cascade;
ALTER TABLE "work_order_item_production_specifications"
  ADD CONSTRAINT "work_order_item_production_specifications_draft_updated_by_users_id_fk"
  FOREIGN KEY ("draft_updated_by") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "work_order_item_production_specifications"
  ADD CONSTRAINT "work_order_item_production_specifications_confirmed_by_users_id_fk"
  FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "work_order_item_production_specification_revisions"
  ADD CONSTRAINT "work_order_item_production_specification_revisions_specification_id_fk"
  FOREIGN KEY ("specification_id") REFERENCES "public"."work_order_item_production_specifications"("id") ON DELETE cascade;
ALTER TABLE "work_order_item_production_specification_revisions"
  ADD CONSTRAINT "work_order_item_production_specification_revisions_work_order_item_id_fk"
  FOREIGN KEY ("work_order_item_id") REFERENCES "public"."work_order_items"("id") ON DELETE cascade;
ALTER TABLE "work_order_item_production_specification_revisions"
  ADD CONSTRAINT "work_order_item_production_specification_revisions_actor_id_users_id_fk"
  FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null;

CREATE INDEX "work_order_specification_catalogue_field_active_idx"
  ON "work_order_specification_catalogue_options" ("field_name", "is_active", "sort_order");
CREATE UNIQUE INDEX "work_order_specification_catalogue_ps_mapping_uq"
  ON "work_order_specification_catalogue_options" ("ps_category_slug", "ps_option_slug");
CREATE UNIQUE INDEX "work_order_item_production_specifications_item_uq"
  ON "work_order_item_production_specifications" ("work_order_item_id");
CREATE INDEX "work_order_item_production_specifications_status_idx"
  ON "work_order_item_production_specifications" ("status");
CREATE INDEX "work_order_item_specification_revisions_item_created_idx"
  ON "work_order_item_production_specification_revisions" ("work_order_item_id", "created_at");
CREATE INDEX "work_order_item_specification_revisions_specification_idx"
  ON "work_order_item_production_specification_revisions" ("specification_id");

INSERT INTO "work_order_specification_catalogue_options"
  ("id", "field_name", "display_label", "production_label", "aliases", "ps_category_slug", "ps_option_slug", "ps1_applicable", "ps3_applicable", "sort_order")
VALUES
  ('system.double-disc', 'system', 'Double Disc', 'Double Disc', '["double disc"]', 'system', 'double-disc', true, true, 10),
  ('system.frameless-spigot', 'system', 'Frameless Spigot', 'Frameless Spigot', '["spigot"]', 'system', 'frameless-spigot', true, true, 20),
  ('system.shower-glass', 'system', 'Shower Glass', 'Shower Glass', '["shower glass"]', NULL, NULL, false, false, 30),
  ('system.shower-screen', 'system', 'Shower Screen', 'Shower Screen', '["shower screens"]', NULL, NULL, false, false, 40),
  ('system.glass-pool-fence', 'system', 'Glass Pool Fence', 'Glass Pool Fence', '["pool fence","pool fencing"]', NULL, NULL, false, false, 50),
  ('system.handrail', 'system', 'Handrail', 'Handrail', '["hand rail"]', NULL, NULL, false, false, 60),
  ('structure_material.timber', 'structureMaterial', 'Timber', 'Timber', '["wood"]', 'structure_material', 'timber', true, true, 10),
  ('structure_material.concrete', 'structureMaterial', 'Concrete', 'Concrete', '[]', 'structure_material', 'concrete', true, true, 20),
  ('structure_material.steel', 'structureMaterial', 'Steel', 'Steel', '["stainless steel"]', 'structure_material', 'steel', true, true, 30),
  ('structure_type.deck', 'structureType', 'Deck', 'Deck', '[]', 'structure_type', 'deck', true, true, 10),
  ('structure_type.balcony', 'structureType', 'Balcony', 'Balcony', '["balcony area"]', 'structure_type', 'balcony', true, true, 20),
  ('structure_type.pool', 'structureType', 'Pool Area', 'Pool Area', '["pool"]', 'structure_type', 'pool', true, true, 30),
  ('structure_type.stair', 'structureType', 'Stair Area', 'Stair Area', '["stairs","staircase"]', 'structure_type', 'stair', true, true, 40),
  ('structure_type.landing', 'structureType', 'Landing', 'Landing', '[]', 'structure_type', 'landing', true, true, 50),
  ('structure_type.stair-and-landing', 'structureType', 'Stair and Landing', 'Stair & Landing', '[]', 'structure_type', 'stair-and-landing', true, true, 60),
  ('structure_type.stair-and-balcony', 'structureType', 'Stair and Balcony Area', 'Stair & Balcony', '[]', 'structure_type', 'stair-and-balcony', true, true, 70),
  ('location.internal', 'locationEnvironment', 'Internal', 'Int', '["inside","interior"]', 'location', 'internal', true, true, 10),
  ('location.external', 'locationEnvironment', 'External', 'Ext', '["outside","exterior"]', 'location', 'external', true, true, 20),
  ('location.both', 'locationEnvironment', 'Internal and External', 'Int/Ext', '["both"]', 'location', 'both', true, true, 30),
  ('location_detail.bathroom', 'locationDetail', 'Bathroom', 'Bathroom', '[]', NULL, NULL, false, false, 10),
  ('location_detail.balcony', 'locationDetail', 'Balcony', 'Balcony', '["balcony area"]', NULL, NULL, false, false, 20),
  ('location_detail.pool-area', 'locationDetail', 'Pool Area', 'Pool Area', '["pool"]', NULL, NULL, false, false, 30),
  ('location_detail.stair-area', 'locationDetail', 'Stair Area', 'Stair Area', '["stairs","staircase"]', NULL, NULL, false, false, 40),
  ('location_detail.landing', 'locationDetail', 'Landing', 'Landing', '[]', NULL, NULL, false, false, 50),
  ('location_detail.deck', 'locationDetail', 'Deck', 'Deck', '[]', NULL, NULL, false, false, 60),
  ('structure_built.new', 'structureBuilt', 'New', 'New', '[]', 'structure_built', 'new', true, true, 10),
  ('structure_built.existing', 'structureBuilt', 'Existing', 'Existing', '[]', 'structure_built', 'existing', true, true, 20),
  ('glass_construction.toughened', 'glassConstruction', 'Toughened', 'Toughened', '["tempered"]', 'glass_type', 'toughened', true, true, 10),
  ('glass_construction.laminated', 'glassConstruction', 'Laminated', 'Laminated', '[]', 'glass_type', 'laminated', true, true, 20),
  ('glass_appearance.clear', 'glassAppearance', 'Clear', 'Clear', '["clear float"]', NULL, NULL, false, false, 10),
  ('glass_appearance.tinted', 'glassAppearance', 'Tinted', 'Tinted', '[]', NULL, NULL, false, false, 20),
  ('glass_appearance.frosted', 'glassAppearance', 'Frosted', 'Frosted', '["frozened","obscure"]', NULL, NULL, false, false, 30),
  ('glass_appearance.ultra-clear', 'glassAppearance', 'Ultra-Clear', 'Ultra-Clear', '["low iron"]', NULL, NULL, false, false, 40),
  ('thickness.10mm', 'thickness', '10mm', '10 mm', '["10 mm"]', NULL, NULL, false, false, 10),
  ('thickness.12mm', 'thickness', '12mm', '12 mm', '["12 mm"]', 'thickness', '12mm', true, true, 20),
  ('thickness.15mm', 'thickness', '15mm', '15 mm', '["15 mm"]', 'thickness', '15mm', true, true, 30),
  ('thickness.17-52mm', 'thickness', '17.52mm', '17.52 mm', '["17.52 mm"]', 'thickness', '17-52mm', true, true, 40),
  ('gate_required.no', 'gateRequired', 'No', 'No Gate', '[]', 'gate_required', 'no', true, true, 10),
  ('gate_required.yes', 'gateRequired', 'Yes', 'Gate', '["gate"]', 'gate_required', 'yes', true, true, 20),
  ('door_opening_type.hinged', 'doorOpeningType', 'Hinged', 'Hinged', '["hinge"]', NULL, NULL, false, false, 10),
  ('door_opening_type.sliding', 'doorOpeningType', 'Sliding', 'Sliding', '["slider"]', NULL, NULL, false, false, 20),
  ('door_opening_type.fixed-panel', 'doorOpeningType', 'Fixed Panel', 'Fixed Panel', '["fixed glass"]', NULL, NULL, false, false, 30),
  ('door_opening_type.gate', 'doorOpeningType', 'Gate', 'Gate', '[]', NULL, NULL, false, false, 40),
  ('door_opening_type.none', 'doorOpeningType', 'No Door/Opening', 'No Door', '[]', NULL, NULL, false, false, 50),
  ('fixing_method.double-disc', 'fixingMethod', 'Double Disc', 'Double Disc', '[]', NULL, NULL, false, false, 10),
  ('fixing_method.top-mounted-channel', 'fixingMethod', 'Top-Mounted Base Channel', 'Top-Mounted Channel', '["base channel","posiglaze"]', NULL, NULL, false, false, 20),
  ('finish.chrome', 'hardwareFinish', 'Chrome', 'Chrome', '["polished chrome"]', NULL, NULL, false, false, 10),
  ('finish.matte-black', 'hardwareFinish', 'Matte Black', 'Matte Black', '["black"]', NULL, NULL, false, false, 20),
  ('finish.brushed-nickel', 'hardwareFinish', 'Brushed Nickel', 'Brushed Nickel', '["nickel"]', NULL, NULL, false, false, 30),
  ('system_finish.ironsand', 'systemFinish', 'Ironsand', 'Ironsand', '["iron sand"]', NULL, NULL, false, false, 10),
  ('interlinking_rail.21x25mm', 'interlinkingRail', '21 x 25mm Interlinking Rail', 'IL Rail 21 x 25 mm', '["interlinking rail","il rail"]', NULL, NULL, false, false, 10),
  ('delivery_scope.supply-only', 'deliveryScope', 'Supply Only', 'Supply Only', '[]', NULL, NULL, false, false, 10),
  ('delivery_scope.supply-install', 'deliveryScope', 'Supply and Install', 'Supply & Install', '["supply & install"]', NULL, NULL, false, false, 20),
  ('delivery_scope.install-only', 'deliveryScope', 'Install Only', 'Install Only', '[]', NULL, NULL, false, false, 30);
