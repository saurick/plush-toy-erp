-- Configurable approval candidates must be able to approve or reject a task
-- after the frozen responsibility revision selects them as its owner. These
-- RBAC grants remain bounded by customer entitlements, owner pool,
-- owner/assignee, task status/version and the domain action contract.
WITH desired_roles(role_key) AS (
  VALUES
    ('sales'),
    ('purchase'),
    ('engineering')
),
inserted AS (
  INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
  SELECT role_record."id", permission_record."id", CURRENT_TIMESTAMP
  FROM desired_roles
  JOIN "roles" AS role_record
    ON role_record."role_key" = desired_roles.role_key
   AND role_record."role_type" = 'business_default'
  JOIN "permissions" AS permission_record
    ON permission_record."permission_key" = 'workflow.task.reject'
  ON CONFLICT ("role_id", "permission_id") DO NOTHING
  RETURNING "role_id"
)
UPDATE "roles"
SET "version" = "version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "role_id" FROM inserted);
