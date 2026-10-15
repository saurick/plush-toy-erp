-- Modify "purchase_order_items" table
ALTER TABLE "purchase_order_items" ADD COLUMN "product_order_no_snapshot" character varying NULL, ADD COLUMN "product_no_snapshot" character varying NULL, ADD COLUMN "product_name_snapshot" character varying NULL;
