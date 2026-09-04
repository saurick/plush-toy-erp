-- migration-risk: maintenance
-- affected-table: sales_orders
-- expected-lock: ACCESS EXCLUSIVE while adding a nullable quoted freight column and validated null-safe CHECK constraints
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true
-- Modify "sales_orders" table
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quoted_freight_nonnegative" CHECK ((quoted_freight_amount IS NULL) OR (quoted_freight_amount >= (0)::numeric)), ADD CONSTRAINT "sales_orders_quoted_freight_terms_valid" CHECK ((quoted_freight_amount IS NULL) OR ((freight_terms)::text = 'EXCLUDED'::text)), ADD COLUMN "quoted_freight_amount" numeric(20,6) NULL;
