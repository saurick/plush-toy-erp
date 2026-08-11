-- migration-risk: maintenance
-- affected-table: finance_facts
-- expected-lock: ROW EXCLUSIVE on finance_facts while canonicalizing payment terms and backfilling due_at
-- preflight: scripts/qa/finance-fact-due-at-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

DO $plush_finance_fact_due_at_precheck$
DECLARE
  incompatible_count bigint;
BEGIN
  SELECT count(*)
    INTO incompatible_count
    FROM finance_facts
   WHERE fact_type IN ('RECEIVABLE', 'PAYABLE')
     AND NOT COALESCE((
       (payment_term IN ('CASH_ON_SHIPMENT', 'DUE_ON_OCCURRENCE')
         AND (payment_term_days IS NULL OR payment_term_days = 0))
       OR (payment_term = 'EOM_30'
         AND (payment_term_days IS NULL OR payment_term_days = 30))
       OR (payment_term = 'EOM_45'
         AND (payment_term_days IS NULL OR payment_term_days = 45))
       OR (payment_term = 'NET_DAYS' AND payment_term_days >= 0)
       OR (payment_term IS NULL AND payment_term_days >= 0)
     ), false);
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_facts contains % receivable/payable rows that cannot be canonicalized', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM finance_facts
   WHERE fact_type NOT IN ('RECEIVABLE', 'PAYABLE')
     AND (payment_term IS NOT NULL OR payment_term_days IS NOT NULL OR due_at IS NOT NULL);
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_facts contains % other rows carrying payment terms or due_at', incompatible_count;
  END IF;
END
$plush_finance_fact_due_at_precheck$;

WITH canonical AS (
  SELECT
    id,
    occurred_at,
    CASE
      WHEN payment_term IN ('CASH_ON_SHIPMENT', 'DUE_ON_OCCURRENCE') THEN 0::bigint
      WHEN payment_term = 'EOM_30' THEN 30::bigint
      WHEN payment_term = 'EOM_45' THEN 45::bigint
      ELSE payment_term_days
    END AS canonical_days
  FROM finance_facts
  WHERE fact_type IN ('RECEIVABLE', 'PAYABLE')
), ready AS (
  SELECT
    id,
    occurred_at,
    canonical_days,
    CASE
      WHEN canonical_days = 0 THEN 'DUE_ON_OCCURRENCE'
      ELSE 'NET_DAYS'
    END AS canonical_term
  FROM canonical
)
UPDATE finance_facts AS fact
   SET payment_term = ready.canonical_term,
       payment_term_days = ready.canonical_days,
       due_at = ready.occurred_at + ready.canonical_days * INTERVAL '1 day'
  FROM ready
 WHERE fact.id = ready.id
   AND (
     fact.payment_term IS DISTINCT FROM ready.canonical_term
     OR fact.payment_term_days IS DISTINCT FROM ready.canonical_days
     OR fact.due_at IS DISTINCT FROM ready.occurred_at + ready.canonical_days * INTERVAL '1 day'
   );

DO $plush_finance_fact_due_at_postcheck$
DECLARE
  unready_count bigint;
BEGIN
  SELECT count(*)
    INTO unready_count
    FROM finance_facts
   WHERE (
     fact_type IN ('RECEIVABLE', 'PAYABLE')
     AND (
       payment_term IS NULL
       OR payment_term_days IS NULL
       OR payment_term NOT IN ('DUE_ON_OCCURRENCE', 'NET_DAYS')
       OR (payment_term = 'DUE_ON_OCCURRENCE' AND payment_term_days <> 0)
       OR (payment_term = 'NET_DAYS' AND payment_term_days <= 0)
       OR due_at IS DISTINCT FROM occurred_at + payment_term_days * INTERVAL '1 day'
     )
   )
   OR (
     fact_type NOT IN ('RECEIVABLE', 'PAYABLE')
     AND (payment_term IS NOT NULL OR payment_term_days IS NOT NULL OR due_at IS NOT NULL)
   );
  IF unready_count > 0 THEN
    RAISE EXCEPTION 'finance_facts due_at backfill left % rows outside the final contract', unready_count;
  END IF;
END
$plush_finance_fact_due_at_postcheck$;
