CREATE TYPE "quote_movement_project_complexity" AS ENUM (
  'unassessed',
  'easy',
  'normal',
  'tight',
  'very_difficult'
);

ALTER TABLE "quote_movement_records"
  ADD COLUMN "project_complexity" "quote_movement_project_complexity"
  DEFAULT 'unassessed' NOT NULL;
