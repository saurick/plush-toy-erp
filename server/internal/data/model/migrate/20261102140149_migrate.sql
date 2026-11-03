-- migration-risk: maintenance
-- affected-table: processes
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/process-reference-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Modify "processes" table
ALTER TABLE "processes" DROP COLUMN "quality_required";
