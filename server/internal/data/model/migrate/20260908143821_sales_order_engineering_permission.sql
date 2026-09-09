INSERT INTO "permissions" ("permission_key", "name", "description", "module", "action", "resource", "builtin", "created_at", "updated_at")
VALUES ('sales_order.engineering.update', '维护订单工程与打样', '维护订单行的工程关联与打样进度，不修改客户承诺、数量或价格。', 'sales_order', 'update', 'engineering', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("permission_key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p."permission_key" = 'sales_order.engineering.update'
WHERE r."role_key" = 'engineering' AND r."role_type" = 'business_default'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

UPDATE "roles" SET "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "role_key" = 'engineering' AND "role_type" = 'business_default';
