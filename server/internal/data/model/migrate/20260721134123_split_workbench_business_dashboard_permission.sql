-- Split the former shared dashboard permission into a per-role workbench entry
-- and a management-only cross-department dashboard entry. Preserve explicit
-- role selections: only roles that held the old permission are migrated.
INSERT INTO "permissions" (
  "permission_key", "name", "description", "module", "action", "resource", "builtin", "created_at", "updated_at"
)
VALUES
  ('erp.workbench.read', '查看岗位工作台', '查看本岗位待办、风险、阻塞和来源单据入口；任务读写仍由 workflow.task.* 单独控制。', 'erp', 'read', 'workbench', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('erp.business_dashboard.read', '查看业务看板', '查看跨部门业务统计；不授予来源单据编辑权。', 'erp', 'read', 'business_dashboard', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("permission_key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT old_binding."role_id", replacement."id", CURRENT_TIMESTAMP
FROM "role_permissions" AS old_binding
JOIN "permissions" AS legacy ON legacy."id" = old_binding."permission_id"
JOIN "permissions" AS replacement ON replacement."permission_key" = 'erp.workbench.read'
WHERE legacy."permission_key" = 'erp.dashboard.read'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT old_binding."role_id", replacement."id", CURRENT_TIMESTAMP
FROM "role_permissions" AS old_binding
JOIN "permissions" AS legacy ON legacy."id" = old_binding."permission_id"
JOIN "roles" AS role_record ON role_record."id" = old_binding."role_id"
JOIN "permissions" AS replacement ON replacement."permission_key" = 'erp.business_dashboard.read'
WHERE legacy."permission_key" = 'erp.dashboard.read'
  AND role_record."role_key" IN ('boss', 'pmc')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

UPDATE "roles" AS role_record
SET "version" = role_record."version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "role_permissions" AS old_binding
  JOIN "permissions" AS legacy ON legacy."id" = old_binding."permission_id"
  WHERE old_binding."role_id" = role_record."id"
    AND legacy."permission_key" = 'erp.dashboard.read'
);

DELETE FROM "role_permissions"
WHERE "permission_id" = (
  SELECT "id" FROM "permissions" WHERE "permission_key" = 'erp.dashboard.read'
);

DELETE FROM "permissions" WHERE "permission_key" = 'erp.dashboard.read';
