-- migration-risk: maintenance
-- affected-table: business_attachments
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Modify "business_attachments" table
ALTER TABLE "business_attachments" DROP CONSTRAINT "business_attachments_file_size_max", ADD CONSTRAINT "business_attachments_file_size_max" CHECK (file_size <= 209715200);
