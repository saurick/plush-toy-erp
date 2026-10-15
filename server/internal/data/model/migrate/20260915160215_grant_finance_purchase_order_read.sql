UPDATE "roles" AS r
SET "version" = r."version" + 1, "updated_at" = CURRENT_TIMESTAMP
WHERE r."role_key" = 'finance'
  AND r."role_type" = 'business_default'
  AND EXISTS (
    SELECT 1 FROM "permissions" AS p
    WHERE p."permission_key" = 'purchase.order.read'
      AND NOT EXISTS (
        SELECT 1 FROM "role_permissions" AS rp
        WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
      )
  );

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" AS r
JOIN "permissions" AS p ON p."permission_key" = 'purchase.order.read'
WHERE r."role_key" = 'finance' AND r."role_type" = 'business_default'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
