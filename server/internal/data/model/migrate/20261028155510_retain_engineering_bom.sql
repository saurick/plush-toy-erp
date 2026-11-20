-- migration-risk: maintenance
-- affected-table: sales_order_items
-- expected-lock: ROW EXCLUSIVE
-- preflight: scripts/qa/engineering-bom-transition-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Retain the order's manufacturing source before removing sampling-only fields.
UPDATE "sales_order_items"
SET "bom_id" = "sample_bom_id", "bom_fingerprint" = CASE WHEN "engineering_status" = 'CONFIRMED' THEN "sample_bom_fingerprint" ELSE NULL END;
