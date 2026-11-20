-- This migration is intentionally data-only. It runs before the Atlas-generated
-- structural migration so legacy rows that cannot be mapped without inventing
-- facts fail with an exact reconciliation boundary.
DO $$
DECLARE
  incompatible_count bigint;
BEGIN
  SELECT count(*) INTO incompatible_count
    FROM "finance_facts"
   WHERE "fact_type" = 'PAYMENT';
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_facts contains % removed PAYMENT rows; reconcile them into finance_payments before applying this migration', incompatible_count;
  END IF;

  SELECT count(*) INTO incompatible_count
    FROM "production_facts"
   WHERE "fact_type" = 'SCRAP';
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'production_facts contains % removed SCRAP rows; reconcile them into production exception WIP events before applying this migration', incompatible_count;
  END IF;

  SELECT count(*) INTO incompatible_count
    FROM "outsourcing_return_dispositions"
   WHERE "production_wip_batch_id" IS NULL;
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'outsourcing_return_dispositions contains % rows without an exact production WIP source; reconcile them before applying this migration', incompatible_count;
  END IF;

  SELECT count(*) INTO incompatible_count
    FROM "production_exception_decisions"
   WHERE NOT (
     (
       "decision_type" = 'OVER_ISSUE'
       AND "production_material_requirement_id" IS NOT NULL
       AND "production_wip_batch_id" IS NULL
       AND "quality_inspection_id" IS NULL
     )
     OR
     (
       "decision_type" IN ('SCRAP', 'WIP_CONCESSION')
       AND "production_material_requirement_id" IS NULL
       AND "production_wip_batch_id" IS NOT NULL
       AND "quality_inspection_id" IS NOT NULL
     )
   );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'production_exception_decisions contains % rows without an exact exception source bundle; reconcile them before applying this migration', incompatible_count;
  END IF;

  SELECT count(*) INTO incompatible_count
    FROM (
      SELECT "quality_inspection_id"
        FROM "production_exception_decisions"
       WHERE "decision_type" IN ('SCRAP', 'WIP_CONCESSION')
         AND "status" IN ('SUBMITTED', 'APPROVED')
       GROUP BY "quality_inspection_id"
      HAVING count(*) > 1
    ) AS duplicate_active_quality_decisions;
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'production_exception_decisions contains % quality inspections with duplicate active SCRAP or WIP_CONCESSION decisions; reconcile each inspection to one exact active decision before applying this migration', incompatible_count;
  END IF;

  SELECT count(*) INTO incompatible_count
    FROM "finance_payments"
   WHERE NOT (
     ("direction" = 'RECEIPT' AND "counterparty_type" = 'CUSTOMER')
     OR
     ("direction" = 'DISBURSEMENT' AND "counterparty_type" = 'SUPPLIER')
   );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_payments contains % rows with incompatible direction and counterparty type; reconcile them before applying this migration', incompatible_count;
  END IF;

  SELECT count(*) INTO incompatible_count
    FROM "finance_credit_notes"
   WHERE NOT (
     ("status" = 'POSTED' AND "reversal_of_credit_note_id" IS NULL)
     OR
     ("status" = 'REVERSED' AND "reversal_of_credit_note_id" IS NOT NULL)
   );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_credit_notes contains % rows without a valid reversal source bundle; reconcile them before applying this migration', incompatible_count;
  END IF;

END
$$;
