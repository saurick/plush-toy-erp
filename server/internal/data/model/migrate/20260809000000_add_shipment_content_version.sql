-- Modify "shipments" table
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_version_positive" CHECK (version > 0), ADD COLUMN "version" bigint NOT NULL DEFAULT 1;
