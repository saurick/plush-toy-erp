-- Convert the canonical product and shipment net-weight unit from kilograms to grams.
-- Preserve master values, immutable shipment snapshots, and idempotency intent snapshots.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM products WHERE unit_net_weight_kg > 99999999999.999999
    UNION ALL
    SELECT 1 FROM product_skus WHERE unit_net_weight_kg > 99999999999.999999
    UNION ALL
    SELECT 1 FROM shipment_items WHERE unit_net_weight_kg_snapshot > 99999999999.999999
    UNION ALL
    SELECT 1 FROM shipments
    WHERE total_net_weight_kg > 99999999999.999999
       OR requested_total_net_weight_kg > 99999999999.999999
  ) THEN
    RAISE EXCEPTION 'net weight exceeds the maximum value convertible from kg to g';
  END IF;
END
$$;

ALTER TABLE "product_skus"
  DROP CONSTRAINT "product_skus_unit_net_weight_kg_positive",
  DROP CONSTRAINT "product_skus_unit_net_weight_kg_requires_default_unit";
ALTER TABLE "product_skus"
  RENAME COLUMN "unit_net_weight_kg" TO "unit_net_weight_g";
UPDATE "product_skus"
SET "unit_net_weight_g" = "unit_net_weight_g" * 1000
WHERE "unit_net_weight_g" IS NOT NULL;
ALTER TABLE "product_skus"
  ADD CONSTRAINT "product_skus_unit_net_weight_g_positive" CHECK ((unit_net_weight_g IS NULL) OR (unit_net_weight_g > (0)::numeric)),
  ADD CONSTRAINT "product_skus_unit_net_weight_g_requires_default_unit" CHECK ((unit_net_weight_g IS NULL) OR (default_unit_id IS NOT NULL));

ALTER TABLE "products"
  DROP CONSTRAINT "products_unit_net_weight_kg_positive";
ALTER TABLE "products"
  RENAME COLUMN "unit_net_weight_kg" TO "unit_net_weight_g";
UPDATE "products"
SET "unit_net_weight_g" = "unit_net_weight_g" * 1000
WHERE "unit_net_weight_g" IS NOT NULL;
ALTER TABLE "products"
  ADD CONSTRAINT "products_unit_net_weight_g_positive" CHECK ((unit_net_weight_g IS NULL) OR (unit_net_weight_g > (0)::numeric));

ALTER TABLE "shipment_items"
  DROP CONSTRAINT "shipment_items_unit_net_weight_kg_snapshot_positive";
ALTER TABLE "shipment_items"
  RENAME COLUMN "unit_net_weight_kg_snapshot" TO "unit_net_weight_g_snapshot";
UPDATE "shipment_items"
SET "unit_net_weight_g_snapshot" = "unit_net_weight_g_snapshot" * 1000
WHERE "unit_net_weight_g_snapshot" IS NOT NULL;
ALTER TABLE "shipment_items"
  ADD CONSTRAINT "shipment_items_unit_net_weight_g_snapshot_positive" CHECK ((unit_net_weight_g_snapshot IS NULL) OR (unit_net_weight_g_snapshot > (0)::numeric));

ALTER TABLE "shipments"
  DROP CONSTRAINT "shipments_requested_total_net_weight_kg_positive",
  DROP CONSTRAINT "shipments_total_net_weight_kg_positive";
ALTER TABLE "shipments"
  RENAME COLUMN "total_net_weight_kg" TO "total_net_weight_g";
ALTER TABLE "shipments"
  RENAME COLUMN "requested_total_net_weight_kg" TO "requested_total_net_weight_g";
UPDATE "shipments"
SET "total_net_weight_g" = "total_net_weight_g" * 1000,
    "requested_total_net_weight_g" = "requested_total_net_weight_g" * 1000
WHERE "total_net_weight_g" IS NOT NULL
   OR "requested_total_net_weight_g" IS NOT NULL;
ALTER TABLE "shipments"
  ADD CONSTRAINT "shipments_requested_total_net_weight_g_positive" CHECK ((requested_total_net_weight_g IS NULL) OR (requested_total_net_weight_g > (0)::numeric)),
  ADD CONSTRAINT "shipments_total_net_weight_g_positive" CHECK ((total_net_weight_g IS NULL) OR (total_net_weight_g > (0)::numeric));
