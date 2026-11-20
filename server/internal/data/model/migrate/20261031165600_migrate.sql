-- migration-risk: maintenance
-- affected-table: workflow_tasks, workflow_task_number_counters
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/workflow-task-number-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Modify "workflow_tasks" table
ALTER TABLE "workflow_tasks" ADD COLUMN "task_no" character varying NULL;
-- Create index "workflowtask_task_no" to table: "workflow_tasks"
CREATE UNIQUE INDEX "workflowtask_task_no" ON "workflow_tasks" ("task_no");
-- Create "workflow_task_number_counters" table
CREATE TABLE "workflow_task_number_counters" (
  "id" character varying NOT NULL,
  "last_value" bigint NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "workflow_task_number_counters_day" CHECK (length((id)::text) = 8),
  CONSTRAINT "workflow_task_number_counters_positive" CHECK (last_value > 0)
);
