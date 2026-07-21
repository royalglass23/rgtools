-- Retention cleanup scans only completed/inactive Work Orders.
CREATE INDEX IF NOT EXISTS "work_orders_retention_idx"
  ON "work_orders" USING btree ("is_current", "servicem8_active", "date_completed", "updated_at");
