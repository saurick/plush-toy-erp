-- Default responsibilities: warehouse owns physical receiving; production
-- prepares processing requirements; the finance/purchase combination confirms contracts.
UPDATE "roles" SET "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "role_type" = 'business_default' AND "role_key" IN ('warehouse', 'purchase', 'production');

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r JOIN "permissions" p ON p."permission_key" IN (
  'purchase.order.read', 'purchase.receipt.create', 'outsourcing.order.read',
  'supplier.read', 'contact.read', 'material.read', 'process.read', 'product.read', 'product_sku.read'
)
WHERE r."role_key" = 'warehouse' AND r."role_type" = 'business_default'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

DELETE FROM "role_permissions"
WHERE ("role_id", "permission_id") IN (
 SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p ON TRUE
 WHERE TRUE
  AND r."role_type" = 'business_default'
  AND ((r."role_key" = 'purchase' AND p."permission_key" IN ('purchase.receipt.create', 'outsourcing.return_receipt.create'))
    OR (r."role_key" = 'production' AND p."permission_key" IN (
      'outsourcing.order.create', 'outsourcing.order.update', 'outsourcing.order.submit',
      'outsourcing.order.confirm', 'outsourcing.order.close', 'outsourcing.order.cancel',
      'outsourcing.material_issue.create', 'outsourcing.return_receipt.create',
      'outsourcing.fact.post', 'outsourcing.fact.cancel'
    )))
);

-- migration-risk: online
-- preflight: verify default role assignments and preserve their pre-migration snapshot
-- maintenance-required: no
-- affected-table: roles, role_permissions
-- expected-lock: row locks on the three default business roles and their permission links
-- recovery: restore the previous role assignments from the verified pre-migration backup
