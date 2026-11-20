-- migration-risk: maintenance
-- affected-table: payment_method_preferences
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/payment-method-catalogue-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true
-- Modify "payment_method_preferences" table
ALTER TABLE "payment_method_preferences" ADD COLUMN "has_been_used" boolean NOT NULL DEFAULT false;
