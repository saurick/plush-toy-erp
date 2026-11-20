-- Modify "product_skus" table
ALTER TABLE "product_skus" ADD CONSTRAINT "product_skus_unit_net_weight_kg_positive" CHECK ((unit_net_weight_kg IS NULL) OR (unit_net_weight_kg > (0)::numeric)), ADD CONSTRAINT "product_skus_unit_net_weight_kg_requires_default_unit" CHECK ((unit_net_weight_kg IS NULL) OR (default_unit_id IS NOT NULL)), ADD COLUMN "unit_net_weight_kg" numeric(20,6) NULL;
-- Modify "shipment_items" table
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_unit_net_weight_kg_snapshot_positive" CHECK ((unit_net_weight_kg_snapshot IS NULL) OR (unit_net_weight_kg_snapshot > (0)::numeric)), ADD COLUMN "unit_net_weight_kg_snapshot" numeric(20,6) NULL;
-- Modify "shipments" table
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_requested_total_net_weight_kg_positive" CHECK ((requested_total_net_weight_kg IS NULL) OR (requested_total_net_weight_kg > (0)::numeric)), ADD CONSTRAINT "shipments_total_net_weight_kg_positive" CHECK ((total_net_weight_kg IS NULL) OR (total_net_weight_kg > (0)::numeric)), ADD COLUMN "total_net_weight_kg" numeric(20,6) NULL, ADD COLUMN "requested_total_net_weight_kg" numeric(20,6) NULL;
