INSERT INTO "permissions" ("permission_key", "name", "module", "action", "resource", "builtin", "created_at", "updated_at")
VALUES ('engineering.material.read', '查看工程用料汇总', 'engineering', 'read', 'material', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('engineering.material.submit', '提交工程用料审批', 'engineering', 'submit', 'material', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('engineering.material.boss_approve', '审核工程用料', 'engineering', 'boss_approve', 'material', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('engineering.material.finance_approve', '核价批准工程采购', 'engineering', 'finance_approve', 'material', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("permission_key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", CURRENT_TIMESTAMP FROM "roles" r JOIN "permissions" p
ON (p."permission_key" = 'engineering.material.read' AND r."role_key" IN ('sales', 'engineering', 'boss', 'finance', 'purchase', 'pmc'))
OR (p."permission_key" = 'engineering.material.submit' AND r."role_key" = 'engineering')
OR (p."permission_key" = 'engineering.material.boss_approve' AND r."role_key" = 'boss')
OR (p."permission_key" = 'engineering.material.finance_approve' AND r."role_key" = 'finance')
OR (p."permission_key" = 'supplier.read' AND r."role_key" = 'engineering')
WHERE r."role_type" = 'business_default'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

UPDATE "roles" SET "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "role_key" IN ('sales', 'engineering', 'boss', 'finance', 'purchase', 'pmc') AND "role_type" = 'business_default';
