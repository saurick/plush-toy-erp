-- Modify "purchase_receipt_items" table
ALTER TABLE "purchase_receipt_items" ADD COLUMN "declared_quantity" numeric(20,6) NULL;
-- Modify "quality_inspections" table
ALTER TABLE "quality_inspections" ADD COLUMN "check_items" jsonb NULL;
