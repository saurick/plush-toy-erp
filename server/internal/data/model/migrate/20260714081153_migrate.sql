-- Modify "products" table
ALTER TABLE "products" ADD CONSTRAINT "products_unit_net_weight_kg_positive" CHECK ((unit_net_weight_kg IS NULL) OR (unit_net_weight_kg > (0)::numeric)), ADD COLUMN "unit_net_weight_kg" numeric(20,6) NULL;
