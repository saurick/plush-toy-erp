-- Modify "purchase_order_items" table
ALTER TABLE "purchase_order_items" ADD COLUMN "material_spec_snapshot" character varying NULL, ADD COLUMN "supplier_item_no_snapshot" character varying NULL, ADD COLUMN "unit_name_snapshot" character varying NULL;
-- Modify "shipments" table
ALTER TABLE "shipments" ADD COLUMN "receivable_amount_snapshot" numeric(20,6) NULL, ADD COLUMN "quoted_freight_amount_snapshot" numeric(20,6) NULL, ADD COLUMN "tax_amount_snapshot" numeric(20,6) NULL, ADD COLUMN "tax_mode_snapshot" character varying NULL;
