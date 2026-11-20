-- Separate a production over-issue request from a sales quality disposition.
INSERT INTO permissions (permission_key, name, description, module, action, resource, builtin, created_at, updated_at)
VALUES ('production.over_issue.submit', '申请生产超领', '', 'production', 'submit', 'over_issue', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (permission_key) DO NOTHING;

WITH removed AS (
 DELETE FROM role_permissions rp USING roles r, permissions p
 WHERE rp.role_id = r.id AND rp.permission_id = p.id AND r.role_type = 'business_default'
   AND ((r.role_key IN ('production', 'quality') AND p.permission_key = 'production.exception.submit')
     OR (r.role_key = 'production' AND p.permission_key = 'production.material_issue.create'))
 RETURNING rp.role_id
), inserted AS (
 INSERT INTO role_permissions (role_id, permission_id, created_at)
 SELECT r.id, p.id, CURRENT_TIMESTAMP FROM roles r JOIN permissions p ON
   (r.role_key = 'production' AND p.permission_key = 'production.over_issue.submit')
   OR (r.role_key = 'warehouse' AND p.permission_key IN ('production.material_issue.create', 'pmc.plan.read'))
   OR (r.role_key = 'finance' AND p.permission_key IN ('pmc.plan.read', 'production.wip.read'))
   OR (r.role_key = 'sales' AND p.permission_key IN ('stock.reservation.release', 'customer.disable'))
   OR (r.role_key = 'purchase' AND p.permission_key = 'supplier.disable')
   OR (r.role_key = 'engineering' AND p.permission_key IN ('process.disable', 'product.disable', 'product_sku.disable'))
 WHERE r.role_type = 'business_default'
 ON CONFLICT (role_id, permission_id) DO NOTHING
 RETURNING role_id
)
UPDATE roles SET version = version + 1, updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT role_id FROM removed UNION SELECT role_id FROM inserted);

UPDATE permissions SET name = '提出质量异常处置方案', updated_at = CURRENT_TIMESTAMP
WHERE permission_key = 'production.exception.submit' AND builtin = true AND name <> '提出质量异常处置方案';

-- Keep the creation intent and original events. Reassignment is a new event;
-- only unfinished tasks return to the purchasing pool for a fresh claim.
WITH prior AS MATERIALIZED (
 SELECT id, owner_role_key, assignee_id, task_status_key
 FROM workflow_tasks
 WHERE task_group = 'handoff_outsourcing_contract'
   AND source_type = 'outsourcing_order' AND source_id > 0
   AND task_code = 'source-handoff-outsourcing-contract-' || source_id::text
   AND payload->>'source_record_id' = source_id::text
   AND payload->>'source_task_intent_hash' ~ '^[0-9a-f]{64}$'
   AND owner_role_key = 'finance' AND required_capability_key = 'outsourcing.order.confirm'
   AND payload->>'source_task_contract' = 'workflow.source-task/v1'
   AND payload->>'source_task_producer' = 'fulfillment.source'
 FOR UPDATE
), changed AS (
 UPDATE workflow_tasks t SET owner_role_key = 'purchase', owner_pool_key = 'purchase',
   assignee_id = CASE WHEN t.task_status_key IN ('ready', 'blocked') THEN NULL ELSE t.assignee_id END,
   version = t.version + 1, updated_at = CURRENT_TIMESTAMP
 FROM prior WHERE t.id = prior.id
 RETURNING t.id, t.version, t.task_status_key
)
INSERT INTO workflow_task_events (task_id, task_version, event_type, from_status_key, to_status_key, reason, payload, created_at)
SELECT c.id, c.version, 'role_reassigned', c.task_status_key, c.task_status_key,
 '加工合同补价确认归采购办理，保留原责任人与状态记录',
 jsonb_build_object('previous_owner_role_key', p.owner_role_key, 'previous_assignee_id', p.assignee_id, 'owner_role_key', 'purchase'), CURRENT_TIMESTAMP
FROM changed c JOIN prior p ON p.id = c.id;

-- migration-risk: online
-- preflight: retain role bindings and source task history in the verified backup
-- maintenance-required: no
-- affected-table: permissions, roles, role_permissions, workflow_tasks, workflow_task_events
-- expected-lock: row locks on changed default role bindings and source contract tasks
-- recovery: restore the verified backup and prior product version together
