-- Modify "sales_orders" table
ALTER TABLE "sales_orders" ADD COLUMN "sales_owner" character varying NULL, ADD COLUMN "contact_snapshot" jsonb NULL;
-- Create index "salesorder_sales_owner" to table: "sales_orders"
CREATE INDEX "salesorder_sales_owner" ON "sales_orders" ("sales_owner");
