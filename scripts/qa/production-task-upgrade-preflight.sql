\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

DO $production_task_upgrade$
DECLARE
  blockers bigint;
  legacy_predicate text := 'TRUE';
BEGIN
  IF to_regclass('public.production_wip_batches') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'production_wip_batches' AND column_name = 'finished_goods_receipt_id') THEN
      legacy_predicate := 'b.finished_goods_receipt_id IS NULL';
    END IF;
    EXECUTE format($query$
      SELECT count(*) FROM production_wip_batches b
      JOIN production_order_operations o ON o.id = b.production_order_operation_id
      WHERE o.operation_code = 'PACKAGING' AND b.status NOT IN ('CANCELLED', 'SPLIT')
        AND %s AND (b.status <> 'ACCEPTED' OR
          COALESCE((SELECT sum(f.quantity) FROM production_facts f
            WHERE f.production_wip_batch_id = b.id AND f.fact_type = 'FINISHED_GOODS_RECEIPT'
              AND f.status = 'POSTED'), 0) <> b.quantity)
    $query$, legacy_predicate) INTO blockers;
    IF blockers > 0 THEN
      RAISE EXCEPTION 'production task upgrade blocked: % legacy packaging batches are not fully received. Complete or cancel these batches through the existing business version before upgrading; do not fabricate warehouse receipts in migration.', blockers;
    END IF;
    SELECT count(*) INTO blockers FROM production_facts f
      JOIN production_wip_batches b ON b.id = f.production_wip_batch_id
      JOIN production_order_operations o ON o.id = b.production_order_operation_id
      WHERE f.fact_type = 'FINISHED_GOODS_RECEIPT' AND f.status = 'DRAFT' AND o.operation_code = 'PACKAGING';
    IF blockers > 0 THEN
      RAISE EXCEPTION 'production task upgrade blocked: % packaging-source receipt drafts must be posted or cancelled in the existing version before upgrading.', blockers;
    END IF;
  END IF;
  IF to_regclass('public.process_instances') IS NOT NULL THEN
    SELECT count(*) INTO blockers FROM process_instances p
      WHERE p.status <> 'completed' AND (
        (p.process_key = 'production_exception_approval' AND
          COALESCE(p.module_contract_snapshot->>'fact_boundary', '') <> 'inventory_disposition_by_explicit_domain_command') OR
        (p.process_key = 'finished_goods_delivery' AND EXISTS (
          SELECT 1 FROM process_node_instances n WHERE n.process_instance_id = p.id
            AND n.node_key = 'shipment_execution' AND n.owner_pool_key = 'warehouse')));
    IF blockers > 0 THEN
      RAISE EXCEPTION 'production task upgrade blocked: % active exception or delivery processes still own a frozen responsibility contract. Complete or formally terminate these processes in the existing version before upgrading.', blockers;
    END IF;
  END IF;
END
$production_task_upgrade$;

COMMIT;
