-- Existing business-default warehouse roles already own the inbound-confirm
-- capability. Add only the two read capabilities needed to inspect a
-- production completion draft and its immutable production-order source
-- before confirming finished-goods inbound. Custom roles remain untouched.
WITH desired_permissions(permission_key) AS (
  VALUES
    ('production.fact.read'),
    ('production.wip.read')
),
inserted AS (
  INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
  SELECT role_record."id", permission_record."id", CURRENT_TIMESTAMP
  FROM "roles" AS role_record
  CROSS JOIN desired_permissions
  JOIN "permissions" AS permission_record
    ON permission_record."permission_key" = desired_permissions.permission_key
  WHERE role_record."role_key" = 'warehouse'
    AND role_record."role_type" = 'business_default'
  ON CONFLICT ("role_id", "permission_id") DO NOTHING
  RETURNING "role_id"
)
UPDATE "roles"
SET "version" = "version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" IN (SELECT "role_id" FROM inserted);
