-- migration-risk: maintenance
-- affected-table: production_order_items
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/canonical-business-upgrade-preflight.sql
-- recovery: restore-reviewed-pre-migration-backup-and-previous-runtime
-- maintenance-required: true
-- Modify "production_order_items" table
ALTER TABLE "production_order_items" DROP CONSTRAINT "production_order_items_customer_gate_route", DROP CONSTRAINT "production_order_items_route_allowed", ADD CONSTRAINT "production_order_items_route_allowed" CHECK ((route_code)::text = 'PLUSH_SEW_HAND_V1'::text), ALTER COLUMN "route_code" SET NOT NULL;
