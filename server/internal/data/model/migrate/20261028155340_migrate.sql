-- migration-risk: maintenance
-- affected-table: sales_order_items
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/engineering-bom-transition-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true
-- Modify "sales_order_items" table
ALTER TABLE "sales_order_items" ADD COLUMN "bom_fingerprint" character varying NULL, ADD COLUMN "bom_id" bigint NULL, ADD CONSTRAINT "sales_order_items_bom_headers_bom" FOREIGN KEY ("bom_id") REFERENCES "bom_headers" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
