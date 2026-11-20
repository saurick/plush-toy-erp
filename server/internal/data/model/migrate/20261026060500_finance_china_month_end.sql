-- migration-risk: maintenance
-- affected-table: finance_facts
-- expected-lock: ROW EXCLUSIVE on finance_facts while correcting due dates
-- preflight: scripts/qa/finance-china-month-end-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

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
  SELECT id,
    (date_trunc('month', occurred_at AT TIME ZONE 'Asia/Shanghai') + INTERVAL '1 month - 1 day'
      + (occurred_at AT TIME ZONE 'Asia/Shanghai' - date_trunc('day', occurred_at AT TIME ZONE 'Asia/Shanghai'))
      + payment_term_days * INTERVAL '1 day') AT TIME ZONE 'Asia/Shanghai' AS due_at
  FROM finance_facts
  WHERE fact_type IN ('RECEIVABLE', 'PAYABLE') AND payment_term = 'EOM_DAYS'
)
UPDATE finance_facts AS fact
   SET due_at = expected.due_at, version = fact.version + 1, updated_at = CURRENT_TIMESTAMP
  FROM expected
 WHERE fact.id = expected.id AND fact.due_at IS DISTINCT FROM expected.due_at;
