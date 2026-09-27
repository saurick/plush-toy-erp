-- migration-risk: maintenance
-- affected-table: units, materials, products, product_skus, inventory_txns, inventory_balances
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/unit-normalization-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true
-- Source aliases change identity and spelling only. No physical conversion or quantity rounding.
-- Unsupported active units, fractional counts, request conflicts and balance overflow block atomically.

-- Modify "units" table
ALTER TABLE "units" ADD CONSTRAINT "units_precision_allowed" CHECK (("precision" >= 0) AND ("precision" <= 6));
