-- Custom SQL migration file, put your code below! --
CREATE TABLE IF NOT EXISTS "quote_movement_source_enrichment" (
  "source_id" uuid PRIMARY KEY NOT NULL REFERENCES "quote_movement_sources"("id") ON DELETE cascade,
  "interpretation_status" text NOT NULL,
  "summary" text,
  "safe_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "quote_movement_source_enrichment" (
  "source_id",
  "interpretation_status",
  "summary",
  "safe_error"
)
SELECT
  "id",
  "interpretation_status",
  "content" ->> 'summary',
  "safe_error"
FROM "quote_movement_sources"
ON CONFLICT ("source_id") DO NOTHING;

UPDATE "quote_movement_sources"
SET "content" = "content" - 'summary'
WHERE "content" ? 'summary';

ALTER TABLE "quote_movement_sources"
  DROP COLUMN IF EXISTS "interpretation_status",
  DROP COLUMN IF EXISTS "safe_error";

DROP INDEX IF EXISTS "quote_movement_sources_identity_uq";
CREATE UNIQUE INDEX "quote_movement_sources_identity_uq"
  ON "quote_movement_sources" USING btree (
    "quote_movement_record_id",
    "source_identity"
  );

DROP INDEX IF EXISTS "quote_movement_sources_interpretation_status_idx";
CREATE INDEX IF NOT EXISTS "quote_movement_source_enrichment_status_idx"
  ON "quote_movement_source_enrichment" USING btree ("interpretation_status");
