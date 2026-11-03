-- migration-risk: maintenance
-- affected-table: bom_headers
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/populated-upgrade-20260714055504.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Modify "bom_headers" table
ALTER TABLE "bom_headers" DROP CONSTRAINT "bom_headers_effective_dates_ordered", DROP COLUMN "effective_from", DROP COLUMN "effective_to";
