-- migration-risk: maintenance
-- affected-table: outsourcing_orders, purchase_orders, sales_orders
-- expected-lock: ACCESS EXCLUSIVE while adding required currency columns and validated CHECK constraints
-- preflight: scripts/qa/finance-fact-due-at-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

-- Modify "outsourcing_orders" table
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_currency_allowed" CHECK ((currency)::text = ANY ((ARRAY['USD'::character varying, 'CNY'::character varying, 'HKD'::character varying])::text[])), ADD CONSTRAINT "outsourcing_orders_payment_term_days_nonnegative" CHECK ((payment_term_days IS NULL) OR (payment_term_days >= 0)), ADD COLUMN "currency" character varying NOT NULL DEFAULT 'CNY', ADD COLUMN "payment_term_days" bigint NULL;
-- Modify "purchase_orders" table
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_currency_allowed" CHECK ((currency)::text = ANY ((ARRAY['USD'::character varying, 'CNY'::character varying, 'HKD'::character varying])::text[])), ADD CONSTRAINT "purchase_orders_payment_term_days_nonnegative" CHECK ((payment_term_days IS NULL) OR (payment_term_days >= 0)), ADD COLUMN "currency" character varying NOT NULL DEFAULT 'CNY', ADD COLUMN "payment_term_days" bigint NULL;
-- Modify "sales_orders" table
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_currency_allowed" CHECK ((currency)::text = ANY ((ARRAY['USD'::character varying, 'CNY'::character varying, 'HKD'::character varying])::text[])), ADD COLUMN "currency" character varying NOT NULL DEFAULT 'CNY';
