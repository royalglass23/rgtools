-- Run this only in the dedicated, non-production E2E database.
-- Replace the placeholder with the exact E2E_DATABASE_SENTINEL value.

CREATE SCHEMA IF NOT EXISTS rgtools_e2e;

CREATE TABLE IF NOT EXISTS rgtools_e2e.database_sentinel (
  id smallint PRIMARY KEY CHECK (id = 1),
  sentinel text NOT NULL CHECK (length(sentinel) >= 32)
);

INSERT INTO rgtools_e2e.database_sentinel (id, sentinel)
VALUES (1, 'replace-with-the-exact-32-plus-character-sentinel')
ON CONFLICT (id) DO UPDATE
SET sentinel = EXCLUDED.sentinel;

REVOKE ALL ON SCHEMA rgtools_e2e FROM PUBLIC;
REVOKE ALL ON TABLE rgtools_e2e.database_sentinel FROM PUBLIC;
