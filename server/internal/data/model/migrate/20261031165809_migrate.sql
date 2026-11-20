-- migration-risk: maintenance
-- affected-table: workflow_tasks
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/workflow-task-number-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Modify "workflow_tasks" table
ALTER TABLE "workflow_tasks" ADD CONSTRAINT "workflow_tasks_number_present" CHECK ((length(TRIM(BOTH FROM task_no)) >= 15) AND (length(TRIM(BOTH FROM task_no)) <= 30)), ALTER COLUMN "task_no" SET NOT NULL;
