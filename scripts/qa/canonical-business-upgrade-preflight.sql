\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

DO $canonical_business_upgrade$
DECLARE
  blockers bigint;
BEGIN
  IF to_regclass('public.production_order_items') IS NOT NULL THEN
    SELECT count(*) INTO blockers FROM production_order_items WHERE route_code IS NULL;
    IF blockers > 0 THEN
      RAISE EXCEPTION 'canonical business upgrade blocked: % production order items have no authoritative route. Resolve their source documents before upgrading; migration must not invent route snapshots or WIP facts.', blockers;
    END IF;
  END IF;
  IF to_regclass('public.process_instances') IS NOT NULL THEN
    SELECT count(DISTINCT p.id) INTO blockers
    FROM process_instances p JOIN process_node_instances n ON n.process_instance_id = p.id
    WHERE p.status <> 'completed' AND n.policy_snapshot->>'command_key' IN (
      'purchase_receipt.create', 'quality_inspection.aggregate_gate', 'inventory.post_inbound',
      'finished_goods_quality.decide', 'shipment.ship', 'finance.receivable_lead'
    );
    IF blockers > 0 THEN
      RAISE EXCEPTION 'canonical business upgrade blocked: % unfinished process instances use retired fact-writing commands. Complete or formally terminate the original processes before upgrading; retain their facts and audit records.', blockers;
    END IF;
  END IF;
END
$canonical_business_upgrade$;

COMMIT;
