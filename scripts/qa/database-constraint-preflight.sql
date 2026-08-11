\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

DO $plush_database_constraint_preflight$
DECLARE
  blockers text[] := ARRAY[]::text[];
  invalid_count bigint := 0;
  column_count integer := 0;
BEGIN
  IF to_regclass('public.inventory_txns') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'inventory_txns'
       AND column_name IN (
         'id',
         'subject_type',
         'txn_type',
         'direction',
         'quantity',
         'reversal_of_txn_id'
       );
    IF column_count <> 6 THEN
      blockers := array_append(blockers, 'inventory_txns target columns are incomplete');
    ELSE
      EXECUTE $sql$
        SELECT count(*)
          FROM public.inventory_txns AS txn
          LEFT JOIN public.inventory_txns AS original
            ON original.id = txn.reversal_of_txn_id
         WHERE txn.subject_type::text NOT IN ('MATERIAL', 'PRODUCT')
            OR txn.txn_type::text NOT IN (
              'IN',
              'OUT',
              'ADJUST_IN',
              'ADJUST_OUT',
              'TRANSFER_IN',
              'TRANSFER_OUT',
              'REVERSAL'
            )
            OR txn.direction NOT IN (-1, 1)
            OR txn.quantity <= 0
            OR (
              txn.txn_type::text IN ('IN', 'ADJUST_IN', 'TRANSFER_IN')
              AND txn.direction <> 1
            )
            OR (
              txn.txn_type::text IN ('OUT', 'ADJUST_OUT', 'TRANSFER_OUT')
              AND txn.direction <> -1
            )
            OR (
              (txn.txn_type::text = 'REVERSAL')
              <> (txn.reversal_of_txn_id IS NOT NULL)
            )
            OR txn.reversal_of_txn_id = txn.id
            OR (
              txn.reversal_of_txn_id IS NOT NULL
              AND original.id IS NULL
            )
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('inventory_txns has %s rows incompatible with target checks or self reference', invalid_count)
        );
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.inventory_balances') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'inventory_balances'
       AND column_name IN ('subject_type', 'quantity');
    IF column_count <> 2 THEN
      blockers := array_append(blockers, 'inventory_balances target columns are incomplete');
    ELSE
      EXECUTE $sql$
        SELECT count(*)
          FROM public.inventory_balances
         WHERE subject_type::text NOT IN ('MATERIAL', 'PRODUCT')
            OR quantity < 0
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('inventory_balances has %s invalid subject or negative quantity rows', invalid_count)
        );
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.inventory_lots') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'inventory_lots'
       AND column_name IN ('subject_type', 'status');
    IF column_count <> 2 THEN
      blockers := array_append(blockers, 'inventory_lots target columns are incomplete');
    ELSE
      EXECUTE $sql$
        SELECT count(*)
          FROM public.inventory_lots
         WHERE subject_type::text NOT IN ('MATERIAL', 'PRODUCT')
            OR status::text NOT IN ('ACTIVE', 'HOLD', 'REJECTED', 'DISABLED')
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('inventory_lots has %s rows incompatible with target checks', invalid_count)
        );
      END IF;
    END IF;
  END IF;

  FOREACH column_count IN ARRAY ARRAY[1, 2, 3]
  LOOP
    CASE column_count
      WHEN 1 THEN
        IF to_regclass('public.purchase_receipts') IS NULL THEN CONTINUE; END IF;
        EXECUTE $sql$
          SELECT count(*)
            FROM public.purchase_receipts
           WHERE status::text NOT IN ('DRAFT', 'POSTED', 'CANCELLED')
              OR (status::text = 'DRAFT' AND posted_at IS NOT NULL)
              OR (status::text = 'POSTED' AND posted_at IS NULL)
        $sql$ INTO invalid_count;
        IF invalid_count > 0 THEN
          blockers := array_append(blockers, format('purchase_receipts has %s incompatible lifecycle rows', invalid_count));
        END IF;
      WHEN 2 THEN
        IF to_regclass('public.purchase_returns') IS NULL THEN CONTINUE; END IF;
        EXECUTE $sql$
          SELECT count(*)
            FROM public.purchase_returns
           WHERE status::text NOT IN ('DRAFT', 'POSTED', 'CANCELLED')
              OR (status::text = 'DRAFT' AND posted_at IS NOT NULL)
              OR (status::text = 'POSTED' AND posted_at IS NULL)
        $sql$ INTO invalid_count;
        IF invalid_count > 0 THEN
          blockers := array_append(blockers, format('purchase_returns has %s incompatible lifecycle rows', invalid_count));
        END IF;
      WHEN 3 THEN
        IF to_regclass('public.purchase_receipt_adjustments') IS NULL THEN CONTINUE; END IF;
        EXECUTE $sql$
          SELECT count(*)
            FROM public.purchase_receipt_adjustments
           WHERE status::text NOT IN ('DRAFT', 'POSTED', 'CANCELLED')
              OR (status::text = 'DRAFT' AND posted_at IS NOT NULL)
              OR (status::text = 'POSTED' AND posted_at IS NULL)
        $sql$ INTO invalid_count;
        IF invalid_count > 0 THEN
          blockers := array_append(blockers, format('purchase_receipt_adjustments has %s incompatible lifecycle rows', invalid_count));
        END IF;
    END CASE;
  END LOOP;

  IF to_regclass('public.quality_inspections') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'quality_inspections'
       AND column_name IN ('status', 'result', 'inspected_at');
    IF column_count <> 3 THEN
      blockers := array_append(blockers, 'quality_inspections target columns are incomplete');
    ELSE
      EXECUTE $sql$
        SELECT count(*)
          FROM public.quality_inspections
         WHERE status::text NOT IN ('DRAFT', 'SUBMITTED', 'PASSED', 'REJECTED', 'CANCELLED')
            OR (result IS NOT NULL AND result::text NOT IN ('PASS', 'REJECT', 'CONCESSION'))
            OR (
              status::text IN ('DRAFT', 'SUBMITTED', 'CANCELLED')
              AND (result IS NOT NULL OR inspected_at IS NOT NULL)
            )
            OR (
              status::text = 'PASSED'
              AND (
                result IS NULL
                OR result::text NOT IN ('PASS', 'CONCESSION')
                OR inspected_at IS NULL
              )
            )
            OR (
              status::text = 'REJECTED'
              AND (
                result IS NULL
                OR result::text <> 'REJECT'
                OR inspected_at IS NULL
              )
            )
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('quality_inspections has %s incompatible lifecycle rows', invalid_count)
        );
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.business_attachments') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'business_attachments'
       AND column_name IN ('content', 'file_size', 'sha256');
    IF column_count <> 3 THEN
      blockers := array_append(blockers, 'business_attachments target columns are incomplete');
    ELSE
      EXECUTE $sql$
        SELECT count(*)
          FROM public.business_attachments
         WHERE file_size NOT BETWEEN 1 AND 5242880
            OR octet_length(content) <> file_size
            OR sha256 !~ '^[0-9a-f]{64}$'
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format('business_attachments has %s invalid size, content length or sha256 rows', invalid_count)
        );
      END IF;
    END IF;
  END IF;

  IF cardinality(blockers) > 0 THEN
    RAISE EXCEPTION
      'database constraint preflight failed: %',
      array_to_string(blockers, '; ');
  END IF;

  RAISE NOTICE 'database constraint preflight passed';
END
$plush_database_constraint_preflight$;

COMMIT;
