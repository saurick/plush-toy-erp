-- Modify "sales_order_items" table
ALTER TABLE "sales_order_items" ADD COLUMN "import_source" jsonb NULL;
