-- Custom SQL migration file, put your code below! --
UPDATE "work_orders"
SET "raw_servicem8_snapshot" = NULL
WHERE "raw_servicem8_snapshot" IS NOT NULL;
