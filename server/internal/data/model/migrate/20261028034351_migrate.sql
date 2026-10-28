-- Modify "bom_items" table
ALTER TABLE "bom_items" ADD COLUMN "source_snapshot" jsonb NULL;
-- migration-risk: online
-- affected-table: bom_items
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: false

