-- Existing customer databases preserve administrator-selected business-role
-- permissions. Grant the current fixed approval responsibility roles the
-- approve capability required before their customer configuration membership
-- can be published. Runtime checks still enforce customer entitlements,
-- responsibility pools, owner/assignee, task state/version and domain actions.
WITH desired_roles(role_key) AS (
  VALUES
    ('sales'),
    ('purchase'),
    ('finance')
),
inserted AS (
  INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
  SELECT role_record."id", permission_record."id", CURRENT_TIMESTAMP
  FROM desired_roles
  JOIN "roles" AS role_record
    ON role_record."role_key" = desired_roles.role_key
   AND role_record."role_type" = 'business_default'
  JOIN "permissions" AS permission_record
    ON permission_record."permission_key" = 'workflow.task.approve'
  ON CONFLICT ("role_id", "permission_id") DO NOTHING
  RETURNING "role_id"
)
UPDATE "roles"
SET "version" = "version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "role_id" FROM inserted);
