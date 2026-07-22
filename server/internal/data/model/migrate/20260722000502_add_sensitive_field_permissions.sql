-- Sensitive fields are separate, server-enforced read capabilities. Page read
-- permissions no longer imply access to private party, commercial or settlement
-- values. Existing business-default roles receive the reviewed least-privilege
-- defaults; custom roles stay fail closed until explicitly configured.
INSERT INTO "permissions" (
  "permission_key", "name", "description", "module", "action", "resource", "builtin", "created_at", "updated_at"
)
VALUES
  ('field.party_private.read', '查看往来单位隐私字段', '查看客户、供应商和联系人中的电话、地址、税号及账户等隐私字段。', 'field', 'read', 'party_private', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('field.sales_commercial.read', '查看销售商业字段', '查看销售单价、折扣和销售金额等商业字段。', 'field', 'read', 'sales_commercial', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('field.procurement_commercial.read', '查看采购商业字段', '查看采购或委外单价、折扣和金额等商业字段。', 'field', 'read', 'procurement_commercial', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('field.finance_settlement.read', '查看财务结算字段', '查看应收、应付、开票、核销、收付款和账户等结算字段。', 'field', 'read', 'finance_settlement', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("permission_key") DO NOTHING;

WITH desired_permissions(role_key, permission_key) AS (
  VALUES
    ('boss', 'field.party_private.read'),
    ('boss', 'field.sales_commercial.read'),
    ('boss', 'field.procurement_commercial.read'),
    ('boss', 'field.finance_settlement.read'),
    ('sales', 'field.party_private.read'),
    ('sales', 'field.sales_commercial.read'),
    ('purchase', 'field.party_private.read'),
    ('purchase', 'field.procurement_commercial.read'),
    ('finance', 'field.party_private.read'),
    ('finance', 'field.sales_commercial.read'),
    ('finance', 'field.procurement_commercial.read'),
    ('finance', 'field.finance_settlement.read'),
    ('production', 'field.party_private.read'),
    ('production', 'field.procurement_commercial.read')
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
  AND "role_key" IN ('boss', 'sales', 'purchase', 'finance', 'production');
