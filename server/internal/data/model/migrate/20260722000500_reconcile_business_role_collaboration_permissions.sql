-- Reconcile existing Product Core business-default roles with the permissions
-- required by the reviewed nine-role yoyoosun collaboration projection.
-- Fresh databases receive these defaults from the RBAC seed; this migration
-- closes only the populated-upgrade gap and never touches custom/system roles.
WITH desired_permissions(role_key, permission_key) AS (
  VALUES
    ('sales', 'production.wip.read'),
    ('sales', 'production.packaging_material.confirm'),
    ('sales', 'stock.reservation.create'),
    ('boss', 'outsourcing.fact.read'),
    ('boss', 'finance.reconciliation.read'),
    ('boss', 'finance.invoice.read'),
    ('pmc', 'production.fact.read'),
    ('pmc', 'production.wip.read'),
    ('pmc', 'workflow.task.reject'),
    ('purchase', 'outsourcing.fact.read'),
    ('warehouse', 'purchase.return.read'),
    ('warehouse', 'purchase.receipt.adjustment.read'),
    ('quality', 'customer.read'),
    ('quality', 'contact.read'),
    ('quality', 'sales_order.read'),
    ('quality', 'sales_order_item.read'),
    ('quality', 'outsourcing.order.read'),
    ('quality', 'outsourcing.fact.read'),
    ('quality', 'purchase.return.read'),
    ('quality', 'purchase.return.create'),
    ('quality', 'shipment.read'),
    ('quality', 'production.wip.read'),
    ('finance', 'supplier.read'),
    ('finance', 'contact.read'),
    ('finance', 'outsourcing.order.read'),
    ('finance', 'outsourcing.fact.read'),
    ('finance', 'purchase.receipt.read'),
    ('finance', 'quality.inspection.read'),
    ('finance', 'finance.invoice.read'),
    ('finance', 'finance.invoice.confirm'),
    ('finance', 'finance.reconciliation.read'),
    ('finance', 'finance.reconciliation.confirm'),
    ('production', 'outsourcing.fact.read'),
    ('production', 'outsourcing.material_issue.create'),
    ('production', 'outsourcing.return_receipt.create'),
    ('production', 'outsourcing.fact.post'),
    ('production', 'outsourcing.fact.cancel'),
    ('production', 'warehouse.inventory.read'),
    ('production', 'production.fact.read'),
    ('production', 'production.wip.read'),
    ('production', 'production.wip.assign'),
    ('production', 'production.wip.execute'),
    ('production', 'production.wip.rework'),
    ('production', 'production.completion.create'),
    ('production', 'production.material_issue.create'),
    ('production', 'production.rework.create'),
    ('production', 'production.fact.post'),
    ('production', 'production.fact.cancel'),
    ('production', 'workflow.task.reject')
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
  AND "role_key" IN (
    'sales', 'boss', 'pmc', 'purchase', 'warehouse', 'quality', 'finance', 'production'
  );
