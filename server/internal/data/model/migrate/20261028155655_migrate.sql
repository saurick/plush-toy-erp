-- migration-risk: maintenance
-- affected-table: sales_order_items
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/engineering-bom-transition-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true
-- Modify "sales_order_items" table
ALTER TABLE "sales_order_items" DROP CONSTRAINT "sales_order_items_engineering_status_allowed", DROP CONSTRAINT "sales_order_items_sampling_requires_sources", DROP COLUMN "sample_bom_fingerprint", DROP COLUMN "sample_image_attachment_id", DROP COLUMN "engineering_status", DROP COLUMN "sample_note", DROP COLUMN "sample_confirmed_at", DROP COLUMN "sample_confirmed_by", DROP COLUMN "sample_reused_from_item_id", DROP COLUMN "sample_bom_id";
