-- migration-risk: maintenance
-- affected-table: permissions, role_permissions, roles, workflow_tasks, workflow_task_events
-- expected-lock: ROW EXCLUSIVE
-- preflight: scripts/qa/production-task-upgrade-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

INSERT INTO permissions (permission_key, name, description, module, action, resource, builtin, created_at, updated_at)
VALUES
  ('warehouse.packaging.execute', '成品查货与包装', '', 'warehouse', 'execute', 'packaging', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('production.exception.execute', '执行生产异常方案', '', 'production', 'execute', 'exception', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (permission_key) DO NOTHING;

-- Move only the built-in business responsibilities. Preserve unrelated and
-- custom-role choices; the retired direct WIP command is removed globally.
INSERT INTO role_permissions (role_id, permission_id, created_at)
SELECT r.id, p.id, CURRENT_TIMESTAMP
FROM (VALUES
  ('sales', 'production.exception.submit'), ('sales', 'quality.inspection.read'),
  ('sales', 'purchase.receipt.read'), ('sales', 'supplier.read'),
  ('sales', 'shipment.create'), ('sales', 'shipment.update'), ('sales', 'shipment.ship'), ('sales', 'shipment.cancel'),
  ('warehouse', 'production.completion.create'), ('warehouse', 'warehouse.packaging.execute'),
  ('warehouse', 'purchase.receipt.create'), ('warehouse', 'purchase.receipt.cancel_draft'),
  ('warehouse', 'production.exception.execute'), ('production', 'production.exception.execute')
) AS grant_set(role_key, permission_key)
JOIN roles r ON r.role_key = grant_set.role_key AND r.builtin AND r.role_type = 'business_default'
JOIN permissions p ON p.permission_key = grant_set.permission_key
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Retiring a capability also invalidates cached grants on custom roles.
UPDATE roles r SET version = version + 1, updated_at = CURRENT_TIMESTAMP
WHERE NOT (r.builtin AND r.role_type = 'business_default' AND r.role_key IN ('sales','warehouse','quality','production'))
  AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = r.id AND p.permission_key = 'production.wip.rework');

DELETE FROM role_permissions rp USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id AND (
  p.permission_key = 'production.wip.rework' OR
  (r.builtin AND r.role_type = 'business_default' AND (
    (r.role_key = 'production' AND p.permission_key = 'production.completion.create') OR
    (r.role_key = 'quality' AND p.permission_key IN ('purchase.receipt.create', 'purchase.receipt.cancel_draft')) OR
    (r.role_key = 'warehouse' AND p.permission_key IN ('shipment.create', 'shipment.update', 'shipment.ship', 'shipment.cancel'))
  )));
DELETE FROM permissions WHERE permission_key = 'production.wip.rework';
UPDATE roles SET version = version + 1, updated_at = CURRENT_TIMESTAMP
WHERE builtin AND role_type = 'business_default' AND role_key IN ('sales', 'warehouse', 'quality', 'production');

-- Keep original creation receipts and append a responsibility-change event.
-- No task completion or inventory fact is invented by this migration.
WITH changed AS (
  UPDATE workflow_tasks t SET owner_role_key = CASE WHEN t.task_group = 'handoff_production_exception' THEN 'sales' ELSE 'warehouse' END,
    owner_pool_key = CASE WHEN t.task_group = 'handoff_production_exception' THEN 'sales' ELSE 'warehouse' END,
    assignee_id = NULL, task_name = CASE t.task_group
      WHEN 'handoff_purchase_arrival' THEN '采购到货点数'
      WHEN 'handoff_production_completion' THEN '登记成品收仓'
      WHEN 'handoff_production_exception' THEN '决定质量异常处理方案' END,
    required_capability_key = CASE t.task_group
      WHEN 'handoff_purchase_arrival' THEN 'purchase.receipt.create'
      WHEN 'handoff_production_completion' THEN 'production.completion.create'
      WHEN 'handoff_production_exception' THEN 'production.exception.submit' END,
    version = version + 1, updated_at = CURRENT_TIMESTAMP
  WHERE t.task_group IN ('handoff_purchase_arrival', 'handoff_production_completion', 'handoff_production_exception')
    AND t.payload->>'source_task_producer' = 'fulfillment.source'
    AND t.payload->>'source_task_contract' = 'workflow.source-task/v1'
    AND t.owner_role_key <> CASE WHEN t.task_group = 'handoff_production_exception' THEN 'sales' ELSE 'warehouse' END
  RETURNING t.id, t.version, t.task_status_key
)
INSERT INTO workflow_task_events (task_id, task_version, event_type, from_status_key, to_status_key, reason, payload, created_at)
SELECT id, version, 'source_updated', task_status_key, task_status_key,
  '岗位职责更新：仓库点数和收仓，业务决定质量异常方案；原办理记录保留',
  '{"source":"production_task_responsibility_migration"}'::jsonb, CURRENT_TIMESTAMP
FROM changed;
