WITH desired_permissions(permission_key) AS (
  VALUES
    ('material.create'),
    ('material.update'),
    ('material.disable')
)
INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT role_record."id", permission_record."id", CURRENT_TIMESTAMP
FROM "roles" AS role_record
JOIN desired_permissions ON true
JOIN "permissions" AS permission_record
  ON permission_record."permission_key" = desired_permissions.permission_key
WHERE role_record."role_key" = 'engineering'
  AND role_record."role_type" = 'business_default'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

UPDATE "roles"
SET "version" = "version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "role_type" = 'business_default'
  AND "role_key" = 'engineering';
