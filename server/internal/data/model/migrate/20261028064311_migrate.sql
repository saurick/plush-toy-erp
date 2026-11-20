-- migration-risk: maintenance
-- affected-table: bom_items, production_order_material_requirements
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Modify "bom_items" table
ALTER TABLE "bom_items" ALTER COLUMN "quantity" TYPE numeric, ALTER COLUMN "loss_rate" TYPE numeric;
-- Modify "production_order_material_requirements" table
ALTER TABLE "production_order_material_requirements" ALTER COLUMN "unit_quantity_snapshot" TYPE numeric, ALTER COLUMN "loss_rate_snapshot" TYPE numeric;
