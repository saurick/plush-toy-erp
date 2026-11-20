-- Modify "purchase_receipt_adjustments" table
ALTER TABLE "purchase_receipt_adjustments" DROP COLUMN "business_record_id";
-- Modify "purchase_receipts" table
ALTER TABLE "purchase_receipts" DROP COLUMN "business_record_id";
-- Modify "purchase_returns" table
ALTER TABLE "purchase_returns" DROP COLUMN "business_record_id";
-- Drop "business_record_events" table
DROP TABLE "business_record_events";
-- Drop "business_record_items" table
DROP TABLE "business_record_items";
-- Drop "business_records" table
DROP TABLE "business_records";
