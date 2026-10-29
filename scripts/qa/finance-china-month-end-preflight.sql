-- Read-only review of the China calendar correction. Existing canonical UTC
-- values and already-corrected values are understood; other values block it.
DO $$
DECLARE incompatible_count bigint;
BEGIN
  SELECT count(*) INTO incompatible_count
    FROM finance_facts
   WHERE fact_type IN ('RECEIVABLE', 'PAYABLE')
     AND payment_term = 'EOM_DAYS'
     AND (
       payment_term_days IS NULL OR payment_term_days <= 0 OR due_at IS NULL
       OR (due_at IS DISTINCT FROM (
         date_trunc('month', occurred_at AT TIME ZONE 'UTC') + INTERVAL '1 month - 1 day'
         + (occurred_at AT TIME ZONE 'UTC' - date_trunc('day', occurred_at AT TIME ZONE 'UTC'))
         + payment_term_days * INTERVAL '1 day'
       ) AT TIME ZONE 'UTC'
       AND due_at IS DISTINCT FROM (
         date_trunc('month', occurred_at AT TIME ZONE 'Asia/Shanghai') + INTERVAL '1 month - 1 day'
         + (occurred_at AT TIME ZONE 'Asia/Shanghai' - date_trunc('day', occurred_at AT TIME ZONE 'Asia/Shanghai'))
         + payment_term_days * INTERVAL '1 day'
       ) AT TIME ZONE 'Asia/Shanghai')
     );
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance China month-end correction blocked: % noncanonical due dates require review', incompatible_count;
  END IF;
END $$;

WITH expected AS (
  SELECT id, fact_no, fact_type, status, version, occurred_at, payment_term_days, due_at,
    (date_trunc('month', occurred_at AT TIME ZONE 'Asia/Shanghai') + INTERVAL '1 month - 1 day'
      + (occurred_at AT TIME ZONE 'Asia/Shanghai' - date_trunc('day', occurred_at AT TIME ZONE 'Asia/Shanghai'))
      + payment_term_days * INTERVAL '1 day') AT TIME ZONE 'Asia/Shanghai' AS corrected_due_at
  FROM finance_facts
  WHERE fact_type IN ('RECEIVABLE', 'PAYABLE') AND payment_term = 'EOM_DAYS'
)
SELECT id, fact_no, fact_type, status, version, occurred_at, payment_term_days,
       due_at AS previous_due_at, corrected_due_at
  FROM expected
 WHERE due_at IS DISTINCT FROM corrected_due_at
 ORDER BY id;
