-- migration-risk: maintenance
-- affected-table: finance_facts
-- expected-lock: ACCESS EXCLUSIVE while replacing the validated due-date CHECK
-- preflight: scripts/qa/finance-fact-due-at-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

-- Modify "finance_facts" table
ALTER TABLE "finance_facts" DROP CONSTRAINT "finance_facts_due_at_bundle", ADD CONSTRAINT "finance_facts_due_at_bundle" CHECK ((((fact_type)::text = ANY ((ARRAY['RECEIVABLE'::character varying, 'PAYABLE'::character varying])::text[])) AND (payment_term IS NOT NULL) AND (payment_term_days IS NOT NULL) AND (due_at IS NOT NULL) AND ((((payment_term)::text = 'DUE_ON_OCCURRENCE'::text) AND (payment_term_days = 0) AND (due_at = occurred_at)) OR (((payment_term)::text = 'NET_DAYS'::text) AND (payment_term_days > 0) AND (due_at > occurred_at)))) OR (((fact_type)::text <> ALL ((ARRAY['RECEIVABLE'::character varying, 'PAYABLE'::character varying])::text[])) AND (payment_term IS NULL) AND (payment_term_days IS NULL) AND (due_at IS NULL)));
