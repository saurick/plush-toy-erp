INSERT INTO "permissions" (
  "permission_key", "name", "description", "module", "action", "resource", "builtin", "created_at", "updated_at"
)
VALUES
  (
    'workflow.task.supervise',
    '监督跨岗位协同任务',
    '只读查看其他责任岗位的协同任务；不授予代办、转派或完成权限。',
    'workflow', 'supervise', 'task', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'production.fact.read',
    '查看生产记录',
    '查看生产过程和完工等生产记录。',
    'production', 'read', 'fact', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
ON CONFLICT ("permission_key") DO NOTHING;

WITH desired_permissions(role_key, permission_key) AS (
  VALUES
    ('boss', 'workflow.task.supervise'),
    ('boss', 'production.fact.read'),
    ('pmc', 'workflow.task.supervise')
)
INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT role_record."id", permission_record."id", CURRENT_TIMESTAMP
FROM desired_permissions
JOIN "roles" AS role_record
  ON role_record."role_key" = desired_permissions.role_key
 AND role_record."role_type" = 'business_default'
JOIN "permissions" AS permission_record
  ON permission_record."permission_key" = desired_permissions.permission_key
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

UPDATE "roles"
SET "version" = "version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "role_type" = 'business_default'
  AND "role_key" IN ('boss', 'pmc');
