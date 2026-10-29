\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
DO $engineering_bom_transition$
DECLARE
  invalid_count bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_order_items' AND column_name='sample_bom_id') THEN
    EXECUTE $sql$
      SELECT count(*) FROM sales_order_items i LEFT JOIN bom_headers b ON b.id=i.sample_bom_id
      WHERE i.sample_bom_id IS NOT NULL AND (b.id IS NULL OR b.product_id IS DISTINCT FROM i.product_id)
    $sql$ INTO invalid_count;
    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'engineering BOM transition: % order lines have an invalid BOM/product relation', invalid_count;
    END IF;
  END IF;
END
$engineering_bom_transition$;
ROLLBACK;
