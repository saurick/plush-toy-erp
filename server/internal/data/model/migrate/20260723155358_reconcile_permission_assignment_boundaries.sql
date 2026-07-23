-- Reconcile task assignment capability and control-plane role boundaries.
INSERT INTO "permissions" (
  "permission_key", "name", "description", "module", "action", "resource", "builtin", "created_at", "updated_at"
)
VALUES (
  'workflow.task.assign',
  '转交协同任务',
  '将未结束的协同任务转给同一负责岗位的合格人员，或取消个人指派并退回岗位待办池。',
  'workflow', 'assign', 'task', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("permission_key") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "module" = EXCLUDED."module",
    "action" = EXCLUDED."action",
    "resource" = EXCLUDED."resource",
    "builtin" = EXCLUDED."builtin",
    "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT role_record."id", permission_record."id", CURRENT_TIMESTAMP
FROM "roles" AS role_record
JOIN "permissions" AS permission_record
  ON permission_record."permission_key" = 'workflow.task.assign'
WHERE role_record."role_key" = 'boss'
  AND role_record."role_type" = 'business_default'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

UPDATE "roles" AS role_record
SET "version" = role_record."version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE (
    role_record."role_type" = 'business_default'
    AND role_record."role_key" = 'boss'
  )
  OR (
    role_record."role_type" <> 'system'
    AND EXISTS (
      SELECT 1
      FROM "role_permissions" AS role_binding
      JOIN "permissions" AS permission_record
        ON permission_record."id" = role_binding."permission_id"
      WHERE role_binding."role_id" = role_record."id"
        AND permission_record."permission_key" = 'process_runtime.recover'
    )
  );

DELETE FROM "role_permissions" AS role_binding
USING "roles" AS role_record, "permissions" AS permission_record
WHERE role_binding."role_id" = role_record."id"
  AND role_binding."permission_id" = permission_record."id"
  AND permission_record."permission_key" = 'process_runtime.recover'
  AND role_record."role_type" <> 'system';
