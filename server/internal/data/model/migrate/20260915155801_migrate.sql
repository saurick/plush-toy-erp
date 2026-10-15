-- migration-risk: maintenance
-- affected-table: engineering_material_request_items, workflow_tasks, workflow_task_events, permissions
-- expected-lock: ACCESS EXCLUSIVE on engineering_material_request_items while dropping pricing columns; row locks on material approval tasks and permission labels
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore a verified pre-migration backup to recover removed pricing drafts; existing purchase orders and approval events are preserved
-- maintenance-required: true
-- Modify "engineering_material_request_items" table
ALTER TABLE "engineering_material_request_items" DROP CONSTRAINT "engineering_material_request_items_price_valid", DROP CONSTRAINT "engineering_material_request_items_quantity_valid", ADD CONSTRAINT "engineering_material_request_items_quantity_valid" CHECK (required_quantity > (0)::numeric), DROP COLUMN "purchase_quantity", DROP COLUMN "unit_price", DROP COLUMN "expected_arrival_date", DROP COLUMN "note";

UPDATE "permissions"
SET "name" = '审核批准工程采购', "updated_at" = CURRENT_TIMESTAMP
WHERE "permission_key" = 'engineering.material.finance_approve'
  AND "name" IS DISTINCT FROM '审核批准工程采购';

-- Keep the original creation intent and event history; record the display update
-- as a new task version so an open approval screen must refresh before acting.
WITH changed AS (
  UPDATE "workflow_tasks" AS task
  SET "task_name" = CASE task."task_group"
        WHEN 'engineering_material_finance_review' THEN '审核并批准采购用料'
        ELSE task."task_name" END,
      "payload" = jsonb_set(task."payload", '{complete_condition}',
        to_jsonb('核对工程用料，在“处理任务”中提交本次处理结果。'::text)),
      "version" = task."version" + 1,
      "updated_at" = CURRENT_TIMESTAMP
  WHERE task."source_type" = 'engineering_material_request'
    AND task."task_group" IN ('engineering_material_boss_review', 'engineering_material_finance_review', 'engineering_material_revision')
    AND task."payload"->>'source_task_producer' = 'engineering_material_request.approval'
    AND EXISTS (SELECT 1 FROM "engineering_material_requests" AS request WHERE request."id" = task."source_id")
    AND (task."payload"->>'complete_condition' IS DISTINCT FROM '核对工程用料，在“处理任务”中提交本次处理结果。'
      OR (task."task_group" = 'engineering_material_finance_review' AND task."task_name" IS DISTINCT FROM '审核并批准采购用料'))
  RETURNING task."id", task."version", task."task_status_key"
)
INSERT INTO "workflow_task_events" ("task_id", "task_version", "event_type", "from_status_key", "to_status_key", "payload", "created_at")
SELECT "id", "version", 'updated', "task_status_key", "task_status_key",
       '{"migration":"remove_engineering_material_pricing","changed_fields":["task_name","complete_condition"]}'::jsonb,
       CURRENT_TIMESTAMP
FROM changed;
