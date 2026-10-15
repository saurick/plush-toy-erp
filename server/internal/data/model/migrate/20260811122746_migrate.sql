-- migration-risk: maintenance
-- affected-table: workflow_tasks
-- expected-lock: ACCESS EXCLUSIVE while replacing the workflow task status check
-- preflight: scripts/qa/process-runtime-state-machine-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

-- Modify "workflow_tasks" table
ALTER TABLE "workflow_tasks" DROP CONSTRAINT "workflow_tasks_status_allowed", ADD CONSTRAINT "workflow_tasks_status_allowed" CHECK ((task_status_key)::text = ANY ((ARRAY['ready'::character varying, 'blocked'::character varying, 'done'::character varying, 'rejected'::character varying, 'withdrawn'::character varying])::text[]));
