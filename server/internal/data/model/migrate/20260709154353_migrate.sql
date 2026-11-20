-- Modify "outsourcing_orders" table
ALTER TABLE "outsourcing_orders" ADD COLUMN "contract_party_snapshot" jsonb NULL;
-- Modify "purchase_orders" table
ALTER TABLE "purchase_orders" ADD COLUMN "contract_party_snapshot" jsonb NULL;
