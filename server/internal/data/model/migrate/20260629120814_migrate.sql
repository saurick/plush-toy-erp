-- Modify "workflow_tasks" table
ALTER TABLE "workflow_tasks" ADD COLUMN "owner_pool_key" character varying NULL, ADD COLUMN "required_capability_key" character varying NULL, ADD COLUMN "config_revision" character varying NULL;
-- Create index "workflowtask_config_revision_owner_pool_key_task_status_key" to table: "workflow_tasks"
CREATE INDEX "workflowtask_config_revision_owner_pool_key_task_status_key" ON "workflow_tasks" ("config_revision", "owner_pool_key", "task_status_key");
-- Create index "workflowtask_owner_pool_key_task_status_key" to table: "workflow_tasks"
CREATE INDEX "workflowtask_owner_pool_key_task_status_key" ON "workflow_tasks" ("owner_pool_key", "task_status_key");
-- Create index "workflowtask_required_capability_key_task_status_key" to table: "workflow_tasks"
CREATE INDEX "workflowtask_required_capability_key_task_status_key" ON "workflow_tasks" ("required_capability_key", "task_status_key");
