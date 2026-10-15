-- Modify "outsourcing_orders" table
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_version_positive" CHECK (version > 0), ADD COLUMN "version" bigint NOT NULL DEFAULT 1;
-- Modify "purchase_orders" table
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_version_positive" CHECK (version > 0), ADD COLUMN "version" bigint NOT NULL DEFAULT 1;
-- Modify "sales_orders" table
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_version_positive" CHECK (version > 0), ADD COLUMN "version" bigint NOT NULL DEFAULT 1;
