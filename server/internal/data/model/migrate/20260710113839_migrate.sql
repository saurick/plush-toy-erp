-- Modify "purchase_receipts" table
ALTER TABLE "purchase_receipts" ADD COLUMN "idempotency_key" character varying NULL, ADD COLUMN "idempotency_payload_hash" character varying NULL;
-- Create index "purchasereceipt_idempotency_key" to table: "purchase_receipts"
CREATE UNIQUE INDEX "purchasereceipt_idempotency_key" ON "purchase_receipts" ("idempotency_key");
