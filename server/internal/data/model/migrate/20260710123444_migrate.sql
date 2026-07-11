-- Modify "finance_facts" table
ALTER TABLE "finance_facts" ADD COLUMN "occurred_at_specified" boolean NOT NULL DEFAULT false;
-- Modify "inventory_txns" table
ALTER TABLE "inventory_txns" ADD COLUMN "occurred_at_specified" boolean NOT NULL DEFAULT false;
-- Modify "outsourcing_facts" table
ALTER TABLE "outsourcing_facts" ADD COLUMN "occurred_at_specified" boolean NOT NULL DEFAULT false;
-- Modify "production_facts" table
ALTER TABLE "production_facts" ADD COLUMN "occurred_at_specified" boolean NOT NULL DEFAULT false;
-- Modify "stock_reservations" table
ALTER TABLE "stock_reservations" ADD COLUMN "reserved_at_specified" boolean NOT NULL DEFAULT false;
