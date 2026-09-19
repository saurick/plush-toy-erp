-- Warehouse IQC receives and inspects material. Inventory posting stays separate.
INSERT INTO "permissions" ("permission_key", "name", "description", "module", "action", "resource", "builtin", "created_at", "updated_at")
VALUES ('purchase.receipt.cancel_draft', '取消未入库到货登记', '', 'purchase', 'cancel_draft', 'receipt', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("permission_key") DO NOTHING;

WITH inserted AS (
INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", CURRENT_TIMESTAMP FROM "roles" r JOIN "permissions" p
ON p."permission_key" IN ('purchase.order.read', 'purchase.receipt.create', 'purchase.receipt.cancel_draft')
WHERE r."role_key" = 'quality' AND r."role_type" = 'business_default'
ON CONFLICT ("role_id", "permission_id") DO NOTHING
RETURNING "role_id"
)
UPDATE "roles" SET "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "role_id" FROM inserted);

-- Preserve prior ownership in an immutable event before rebinding source tasks.
WITH prior AS MATERIALIZED (
 SELECT "id", "owner_role_key", "assignee_id", "task_status_key"
 FROM "workflow_tasks"
 WHERE "task_group" = 'handoff_purchase_arrival'
   AND "source_type" = 'purchase_order' AND "source_id" > 0
   AND "task_code" = 'source-handoff-purchase-arrival-' || "source_id"::text
   AND "payload"->>'source_record_id' = "source_id"::text
   AND "payload"->>'source_task_intent_hash' ~ '^[0-9a-f]{64}$'
   AND "owner_role_key" = 'warehouse'
   AND "required_capability_key" = 'purchase.receipt.create'
   AND "payload"->>'source_task_contract' = 'workflow.source-task/v1'
   AND "payload"->>'source_task_producer' = 'fulfillment.source'
 FOR UPDATE
), changed AS (
 UPDATE "workflow_tasks" t SET "owner_role_key" = 'quality', "owner_pool_key" = 'quality',
   "assignee_id" = CASE WHEN t."task_status_key" IN ('ready', 'blocked') THEN NULL ELSE t."assignee_id" END,
   "version" = t."version" + 1, "updated_at" = CURRENT_TIMESTAMP
 FROM prior WHERE t."id" = prior."id"
 RETURNING t."id", t."version", t."task_status_key"
)
INSERT INTO "workflow_task_events" ("task_id", "task_version", "event_type", "from_status_key", "to_status_key", "reason", "payload", "created_at")
SELECT c."id", c."version", 'role_reassigned', c."task_status_key", c."task_status_key",
 '来料登记职责归属 IQC，保留原责任人与状态记录',
 jsonb_build_object('previous_owner_role_key', p."owner_role_key", 'previous_assignee_id', p."assignee_id", 'owner_role_key', 'quality'), CURRENT_TIMESTAMP
FROM changed c JOIN prior p ON p."id" = c."id";

-- migration-risk: online
-- preflight: retain the role assignments and source task snapshot in the verified backup
-- maintenance-required: no
-- affected-table: permissions, roles, role_permissions, workflow_tasks, workflow_task_events
-- expected-lock: row locks on the default quality role and source-generated arrival tasks
-- recovery: restore the pre-migration backup and prior product version together
