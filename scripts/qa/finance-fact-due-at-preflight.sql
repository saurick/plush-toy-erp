-- Read-only inventory and fail-closed checks for the staged finance due-date
-- migration. Missing due_at values are expected after the nullable column is
-- added and before the custom backfill; final constraint generation requires
-- the reported due_at_unready_count to reach zero.

SELECT 'finance_facts' AS source_table, currency, count(*) AS row_count
  FROM finance_facts
 GROUP BY currency
 ORDER BY currency;

SELECT 'finance_payments' AS source_table, currency, count(*) AS row_count
  FROM finance_payments
 GROUP BY currency
 ORDER BY currency;

SELECT 'finance_allocations' AS source_table, currency, count(*) AS row_count
  FROM finance_allocations
 GROUP BY currency
 ORDER BY currency;

SELECT 'finance_credit_notes' AS source_table, currency, count(*) AS row_count
  FROM finance_credit_notes
 GROUP BY currency
 ORDER BY currency;

SELECT
  fact_type,
  collection_type,
  counterparty_type,
  payment_term,
  payment_term_days,
  count(*) AS row_count
  FROM finance_facts
 GROUP BY
  fact_type,
  collection_type,
  counterparty_type,
  payment_term,
  payment_term_days
 ORDER BY
  fact_type,
  collection_type NULLS FIRST,
  counterparty_type,
  payment_term NULLS FIRST,
  payment_term_days NULLS FIRST;

DO $$
DECLARE
  incompatible_count bigint;
  finance_facts_currency_incompatible_count bigint;
  finance_payments_currency_incompatible_count bigint;
  finance_allocations_currency_incompatible_count bigint;
  finance_credit_notes_currency_incompatible_count bigint;
  due_at_exists boolean;
  due_at_unready_count bigint;
BEGIN
  SELECT count(*)
    INTO finance_facts_currency_incompatible_count
    FROM finance_facts
   WHERE currency IS NULL OR currency NOT IN ('CNY', 'USD', 'HKD');
  SELECT count(*)
    INTO finance_payments_currency_incompatible_count
    FROM finance_payments
   WHERE currency IS NULL OR currency NOT IN ('CNY', 'USD', 'HKD');
  SELECT count(*)
    INTO finance_allocations_currency_incompatible_count
    FROM finance_allocations
   WHERE currency IS NULL OR currency NOT IN ('CNY', 'USD', 'HKD');
  SELECT count(*)
    INTO finance_credit_notes_currency_incompatible_count
    FROM finance_credit_notes
   WHERE currency IS NULL OR currency NOT IN ('CNY', 'USD', 'HKD');
  IF finance_facts_currency_incompatible_count
      + finance_payments_currency_incompatible_count
      + finance_allocations_currency_incompatible_count
      + finance_credit_notes_currency_incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance tables contain unsupported currencies: finance_facts=%, finance_payments=%, finance_allocations=%, finance_credit_notes=%; allowed values are CNY, USD, HKD',
      finance_facts_currency_incompatible_count,
      finance_payments_currency_incompatible_count,
      finance_allocations_currency_incompatible_count,
      finance_credit_notes_currency_incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM finance_facts
   WHERE collection_type IS NOT NULL
     AND collection_type <> 'ACCOUNTS_RECEIVABLE';
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_facts contains % rows with an unsupported collection_type; reconcile them before applying the staged migration', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM finance_facts
   WHERE counterparty_type NOT IN ('CUSTOMER', 'SUPPLIER');
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_facts contains % rows with an unsupported counterparty_type; reconcile them before applying the staged migration', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM finance_facts
   WHERE payment_term_days < 0;
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_facts contains % rows with negative payment_term_days; reconcile them before applying the staged migration', incompatible_count;
  END IF;

  SELECT count(*)
    INTO incompatible_count
    FROM finance_facts
   WHERE fact_type NOT IN ('RECEIVABLE', 'PAYABLE')
     AND (payment_term IS NOT NULL OR payment_term_days IS NOT NULL);
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_facts contains % non-receivable/payable rows carrying payment terms; reconcile them before applying the staged migration', incompatible_count;
  END IF;

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
       OR (payment_term = 'EOM_DAYS' AND payment_term_days > 0)
       OR (payment_term IS NULL AND payment_term_days >= 0)
     ), false);
  IF incompatible_count > 0 THEN
    RAISE EXCEPTION 'finance_facts contains % receivable/payable rows whose payment term and day snapshot cannot be canonicalized exactly; reconcile them before applying the staged migration', incompatible_count;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'finance_facts'
       AND column_name = 'due_at'
  ) INTO due_at_exists;

  IF due_at_exists THEN
    EXECUTE $readiness$
      WITH canonical_due AS (
        SELECT
          fact_type,
          occurred_at,
          due_at,
          CASE
            WHEN payment_term IN ('CASH_ON_SHIPMENT', 'DUE_ON_OCCURRENCE') THEN 0
            WHEN payment_term = 'EOM_30' THEN 30
            WHEN payment_term = 'EOM_45' THEN 45
            ELSE payment_term_days
          END AS canonical_days
        FROM finance_facts
      ), expected_due AS (
        SELECT
          fact_type,
          due_at,
          canonical_days,
          CASE
            WHEN canonical_days = 0 THEN occurred_at
            WHEN canonical_days > 0 THEN (
              date_trunc('month', occurred_at AT TIME ZONE 'UTC')
              + INTERVAL '1 month'
              - INTERVAL '1 day'
              + (
                occurred_at AT TIME ZONE 'UTC'
                - date_trunc('day', occurred_at AT TIME ZONE 'UTC')
              )
              + canonical_days * INTERVAL '1 day'
            ) AT TIME ZONE 'UTC'
            ELSE NULL
          END AS canonical_due_at
        FROM canonical_due
      )
      SELECT count(*)
        FROM expected_due
       WHERE (
         fact_type IN ('RECEIVABLE', 'PAYABLE')
         AND (
           canonical_days IS NULL
           OR due_at IS DISTINCT FROM canonical_due_at
         )
       )
       OR (fact_type NOT IN ('RECEIVABLE', 'PAYABLE') AND due_at IS NOT NULL)
    $readiness$ INTO due_at_unready_count;
    RAISE NOTICE 'finance_facts due_at_unready_count=%', due_at_unready_count;
  ELSE
    RAISE NOTICE 'finance_facts due_at column is not staged yet';
  END IF;
END
$$;
