-- migration-risk: maintenance
-- affected-table: workflow_tasks
-- expected-lock: ACCESS EXCLUSIVE during the bounded nullability and paired-source constraint update
-- preflight: scripts/qa/business-data-markers-preflight.sql
-- recovery: restore-reviewed-pre-migration-backup-and-previous-runtime
-- maintenance-required: true

-- Modify "workflow_tasks" table
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_source_paired" CHECK (((source_type IS NULL) AND (source_id IS NULL)) OR ((source_type IS NOT NULL) AND (length(TRIM(BOTH FROM source_type)) > 0) AND (source_id IS NOT NULL) AND (source_id > 0))), ALTER COLUMN "source_type" DROP NOT NULL, ALTER COLUMN "source_id" DROP NOT NULL;
