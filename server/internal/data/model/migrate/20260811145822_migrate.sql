-- migration-risk: maintenance
-- affected-table: finance_allocations, finance_credit_notes, finance_facts, finance_payments, suppliers
-- expected-lock: ACCESS EXCLUSIVE while replacing validated CHECK constraints and adding staged columns
-- preflight: scripts/qa/finance-fact-due-at-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

-- Modify "finance_allocations" table
-- Modify "finance_credit_notes" table
-- Modify "finance_facts" table
ALTER TABLE "finance_facts" DROP CONSTRAINT "finance_facts_collection_type_allowed", ADD CONSTRAINT "finance_facts_collection_type_allowed" CHECK ((collection_type IS NULL) OR ((collection_type)::text = 'ACCOUNTS_RECEIVABLE'::text)), DROP CONSTRAINT "finance_facts_counterparty_allowed", ADD CONSTRAINT "finance_facts_counterparty_allowed" CHECK ((counterparty_type)::text = ANY ((ARRAY['CUSTOMER'::character varying, 'SUPPLIER'::character varying])::text[])), DROP CONSTRAINT "finance_facts_payment_term_allowed", ADD CONSTRAINT "finance_facts_payment_term_allowed" CHECK ((payment_term IS NULL) OR ((payment_term)::text = ANY ((ARRAY['CASH_ON_SHIPMENT'::character varying, 'EOM_30'::character varying, 'EOM_45'::character varying, 'DUE_ON_OCCURRENCE'::character varying, 'NET_DAYS'::character varying, 'EOM_DAYS'::character varying])::text[]))), ADD COLUMN "due_at" timestamptz NULL;
-- Modify "finance_payments" table
-- Modify "suppliers" table
ALTER TABLE "suppliers" ADD COLUMN "default_payment_term_days" bigint NOT NULL DEFAULT 0;
