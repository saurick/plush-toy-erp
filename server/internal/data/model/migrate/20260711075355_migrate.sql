-- Modify "workflow_task_events" table
ALTER TABLE "workflow_task_events" ADD COLUMN "idempotency_key" character varying NULL, ADD COLUMN "intent_hash" character varying NULL, ADD COLUMN "command_key" character varying NULL, ADD COLUMN "mutation_result" jsonb NULL;
-- Create index "workflowtaskevent_task_id_idempotency_key" to table: "workflow_task_events"
CREATE UNIQUE INDEX "workflowtaskevent_task_id_idempotency_key" ON "workflow_task_events" ("task_id", "idempotency_key");
