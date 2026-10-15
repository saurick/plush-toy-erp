-- Modify "customers" table
ALTER TABLE "customers" ADD COLUMN "default_payment_method" character varying NULL, ADD COLUMN "default_payment_term_days" bigint NULL;
-- Create index "customer_default_payment_method" to table: "customers"
CREATE INDEX "customer_default_payment_method" ON "customers" ("default_payment_method");
-- Modify "sales_orders" table
ALTER TABLE "sales_orders" ADD COLUMN "payment_method" character varying NULL, ADD COLUMN "payment_term_days" bigint NULL, ADD COLUMN "price_condition_note" character varying NULL;
-- Create index "salesorder_payment_method" to table: "sales_orders"
CREATE INDEX "salesorder_payment_method" ON "sales_orders" ("payment_method");
