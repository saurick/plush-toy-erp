-- Modify "workflow_task_events" table
ALTER TABLE "workflow_task_events" ADD COLUMN "task_version" bigint NULL;
-- Create index "workflowtaskevent_task_id_task_version" to table: "workflow_task_events"
CREATE UNIQUE INDEX "workflowtaskevent_task_id_task_version" ON "workflow_task_events" ("task_id", "task_version");
-- Modify "workflow_tasks" table
ALTER TABLE "workflow_tasks" ADD COLUMN "version" bigint NOT NULL DEFAULT 1;
