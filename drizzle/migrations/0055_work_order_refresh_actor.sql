-- Custom SQL migration file, put your code below! --
ALTER TABLE "work_order_refresh_runs"
  ADD COLUMN IF NOT EXISTS "actor_id" uuid;

DO $$ BEGIN
  ALTER TABLE "work_order_refresh_runs"
    ADD CONSTRAINT "work_order_refresh_runs_actor_id_users_id_fk"
    FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
