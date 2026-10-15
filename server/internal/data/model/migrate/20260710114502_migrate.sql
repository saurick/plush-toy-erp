-- Modify "purchase_receipts" table
ALTER TABLE "purchase_receipts" ADD COLUMN "idempotency_item_count" bigint NULL;
