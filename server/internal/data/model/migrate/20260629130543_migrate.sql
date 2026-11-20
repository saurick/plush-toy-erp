-- Modify "workflow_tasks" table
ALTER TABLE "workflow_tasks" ADD COLUMN "process_instance_id" bigint NULL, ADD COLUMN "process_node_instance_id" bigint NULL;
-- Create index "workflowtask_process_instance_id_task_status_key" to table: "workflow_tasks"
CREATE INDEX "workflowtask_process_instance_id_task_status_key" ON "workflow_tasks" ("process_instance_id", "task_status_key");
-- Create index "workflowtask_process_node_instance_id" to table: "workflow_tasks"
CREATE INDEX "workflowtask_process_node_instance_id" ON "workflow_tasks" ("process_node_instance_id");
