-- Modify "bom_headers" table
ALTER TABLE "bom_headers" ADD COLUMN "source_order_no" character varying NULL, ADD COLUMN "quantity_text" character varying NULL, ADD COLUMN "spare_text" character varying NULL, ADD COLUMN "print_date" timestamptz NULL, ADD COLUMN "designer" character varying NULL, ADD COLUMN "maker" character varying NULL, ADD COLUMN "auditor" character varying NULL, ADD COLUMN "hair_direction" character varying NULL;
-- Modify "bom_items" table
ALTER TABLE "bom_items" ADD COLUMN "piece_count" character varying NULL, ADD COLUMN "total_usage_snapshot" character varying NULL, ADD COLUMN "process_base" character varying NULL, ADD COLUMN "process_method" character varying NULL;
