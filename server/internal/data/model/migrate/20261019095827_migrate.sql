-- migration-risk: maintenance
-- affected-table: admin_users, customers, suppliers
-- expected-lock: ACCESS EXCLUSIVE on admin_users during the bounded schema update
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore-reviewed-pre-migration-backup-and-previous-runtime
-- maintenance-required: true
-- Modify "admin_users" table
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_account_binding" CHECK (((account_kind = 0) AND (supplier_id IS NULL) AND (customer_id IS NULL)) OR ((account_kind = 1) AND (supplier_id IS NOT NULL) AND (customer_id IS NULL) AND (is_super_admin = false)) OR ((account_kind = 2) AND (customer_id IS NOT NULL) AND (supplier_id IS NULL) AND (is_super_admin = false))), ADD COLUMN "account_kind" bigint NOT NULL DEFAULT 0, ADD COLUMN "supplier_id" bigint NULL, ADD COLUMN "customer_id" bigint NULL, ADD CONSTRAINT "admin_users_customers_customer" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON UPDATE NO ACTION ON DELETE RESTRICT, ADD CONSTRAINT "admin_users_suppliers_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON UPDATE NO ACTION ON DELETE RESTRICT;
