-- This migration is intentionally data-only. The following Atlas-generated
-- structural migration retires the generic customer-return tables, so fail
-- closed when either table still contains business records. Those records
-- require an explicit export and reconciliation decision; this migration must
-- not infer a mapping to the narrower rework-intake source document.
DO $$
DECLARE
  retired_return_count bigint;
  retired_item_count bigint;
BEGIN
  SELECT count(*)
    INTO retired_return_count
    FROM "sales_returns";

  SELECT count(*)
    INTO retired_item_count
    FROM "sales_return_items";

  IF retired_return_count > 0 OR retired_item_count > 0 THEN
    RAISE EXCEPTION 'retired customer-return tables contain % sales_returns rows and % sales_return_items rows; export and reconcile them before retrying this migration', retired_return_count, retired_item_count;
  END IF;
END
$$;
