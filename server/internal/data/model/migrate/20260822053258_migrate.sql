-- migration-risk: maintenance
-- affected-table: outsourcing_order_items, purchase_order_items, sales_order_items
-- expected-lock: ACCESS EXCLUSIVE while adding nullable display-order columns and validated CHECK constraints
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

-- Modify "outsourcing_order_items" table
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "outsourcing_order_items_display_order_positive" CHECK ((display_order IS NULL) OR (display_order > 0)), ADD COLUMN "display_order" bigint NULL;
-- Modify "purchase_order_items" table
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_display_order_positive" CHECK ((display_order IS NULL) OR (display_order > 0)), ADD COLUMN "display_order" bigint NULL;
-- Modify "sales_order_items" table
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_display_order_positive" CHECK ((display_order IS NULL) OR (display_order > 0)), ADD COLUMN "display_order" bigint NULL;
