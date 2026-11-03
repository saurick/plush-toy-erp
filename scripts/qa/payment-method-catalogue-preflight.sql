\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
DO $payment_method_catalogue_preflight$
BEGIN
 IF EXISTS (SELECT LOWER(method) FROM payment_method_preferences GROUP BY LOWER(method) HAVING COUNT(*) > 1) THEN
  RAISE EXCEPTION 'payment method catalogue contains case-insensitive duplicate names';
 END IF;
 IF EXISTS (
  SELECT 1 FROM (
   SELECT TRIM(default_payment_method) method FROM customers
   UNION ALL SELECT TRIM(default_payment_method) FROM suppliers
   UNION ALL SELECT TRIM(payment_method) FROM sales_orders
   UNION ALL SELECT TRIM(payment_method) FROM purchase_orders
  ) sources WHERE LENGTH(method) > 128
 ) THEN
  RAISE EXCEPTION 'payment method source exceeds catalogue name limit';
 END IF;
END
$payment_method_catalogue_preflight$;
SELECT COUNT(*) AS existing_choices FROM payment_method_preferences;
COMMIT;
