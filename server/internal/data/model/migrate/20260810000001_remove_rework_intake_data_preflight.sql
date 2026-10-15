-- This migration is intentionally data-only. The following Atlas-generated
-- structural migration removes the retired rework-intake and reshipment
-- schema, so fail closed when any business record still depends on it.
-- Existing data requires an explicit export and reconciliation decision;
-- this migration must not silently discard or reinterpret those records.
DO $$
DECLARE
  rework_intake_count bigint;
  rework_intake_item_count bigint;
  reshipment_count bigint;
  shipment_rework_link_count bigint;
  shipment_item_rework_link_count bigint;
BEGIN
  SELECT count(*)
    INTO rework_intake_count
    FROM "rework_intakes";

  SELECT count(*)
    INTO rework_intake_item_count
    FROM "rework_intake_items";

  SELECT count(*)
    INTO reshipment_count
    FROM "shipments"
    WHERE "purpose" = 'REWORK_RESHIPMENT';

  SELECT count(*)
    INTO shipment_rework_link_count
    FROM "shipments"
    WHERE "rework_intake_id" IS NOT NULL;

  SELECT count(*)
    INTO shipment_item_rework_link_count
    FROM "shipment_items"
    WHERE "rework_completion_fact_id" IS NOT NULL;

  IF rework_intake_count > 0
    OR rework_intake_item_count > 0
    OR reshipment_count > 0
    OR shipment_rework_link_count > 0
    OR shipment_item_rework_link_count > 0 THEN
    RAISE EXCEPTION 'retired rework-intake data remains: rework_intakes=%, rework_intake_items=%, reshipments=%, shipment_rework_links=%, shipment_item_rework_links=%; export and reconcile it before retrying this migration', rework_intake_count, rework_intake_item_count, reshipment_count, shipment_rework_link_count, shipment_item_rework_link_count;
  END IF;
END
$$;
