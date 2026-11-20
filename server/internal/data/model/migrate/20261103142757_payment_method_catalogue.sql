-- migration-risk: maintenance
-- affected-table: payment_method_preferences
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/payment-method-catalogue-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Publish the existing shared suggestions once. Future free text is not added.
WITH sources AS (
 SELECT TRIM(default_payment_method) AS method FROM customers WHERE default_payment_method IS NOT NULL
 UNION ALL SELECT TRIM(default_payment_method) FROM suppliers WHERE default_payment_method IS NOT NULL
 UNION ALL SELECT TRIM(payment_method) FROM sales_orders WHERE payment_method IS NOT NULL
 UNION ALL SELECT TRIM(payment_method) FROM purchase_orders WHERE payment_method IS NOT NULL
)
UPDATE payment_method_preferences AS choice SET has_been_used = true
WHERE EXISTS (SELECT 1 FROM sources WHERE LOWER(sources.method) = LOWER(choice.method));

WITH sources AS (
 SELECT TRIM(default_payment_method) AS method, true AS used FROM customers WHERE default_payment_method IS NOT NULL
 UNION ALL SELECT TRIM(default_payment_method), true FROM suppliers WHERE default_payment_method IS NOT NULL
 UNION ALL SELECT TRIM(payment_method), true FROM sales_orders WHERE payment_method IS NOT NULL
 UNION ALL SELECT TRIM(payment_method), true FROM purchase_orders WHERE payment_method IS NOT NULL
 UNION ALL SELECT method, false FROM (VALUES ('银行转账'), ('现金'), ('银行承兑')) AS defaults(method)
), choices AS (
 SELECT MIN(method) AS method, BOOL_OR(used) AS used FROM sources
 WHERE method <> '' GROUP BY LOWER(method)
)
INSERT INTO payment_method_preferences (method, is_recommended, has_been_used, version, created_at, updated_at)
SELECT choices.method, true, choices.used, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM choices
WHERE NOT EXISTS (SELECT 1 FROM payment_method_preferences current_choice WHERE LOWER(current_choice.method) = LOWER(choices.method))
ON CONFLICT (method) DO UPDATE SET has_been_used = payment_method_preferences.has_been_used OR EXCLUDED.has_been_used;
