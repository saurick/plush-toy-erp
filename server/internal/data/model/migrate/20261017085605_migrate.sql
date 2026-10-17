-- migration-risk: maintenance
-- affected-table: sales_orders,quality_inspections,finance_allocations,finance_credit_notes
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/data-model-integrity-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Modify "quality_inspections" table
ALTER TABLE "quality_inspections" DROP CONSTRAINT "quality_inspections_lifecycle_shape", ADD CONSTRAINT "quality_inspections_lifecycle_shape" CHECK ((((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'SUBMITTED'::character varying, 'CANCELLED'::character varying])::text[])) AND (result IS NULL) AND (inspected_at IS NULL)) OR (((status)::text = 'PASSED'::text) AND (result IS NOT NULL) AND ((result)::text = ANY ((ARRAY['PASS'::character varying, 'CONCESSION'::character varying])::text[])) AND (inspected_at IS NOT NULL)) OR (((status)::text = 'REJECTED'::text) AND (result IS NOT NULL) AND ((result)::text = 'REJECT'::text) AND (inspected_at IS NOT NULL)));
-- Modify "sales_orders" table
ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_quoted_freight_terms_valid", ADD CONSTRAINT "sales_orders_quoted_freight_terms_valid" CHECK ((quoted_freight_amount IS NULL) OR ((freight_terms IS NOT NULL) AND ((freight_terms)::text = 'EXCLUDED'::text))), DROP CONSTRAINT "sales_orders_tax_pair_valid", ADD CONSTRAINT "sales_orders_tax_pair_valid" CHECK (((tax_mode IS NULL) AND (tax_rate IS NULL)) OR ((tax_mode IS NOT NULL) AND ((((tax_mode)::text = 'NONE'::text) AND (tax_rate IS NULL)) OR (((tax_mode)::text = ANY ((ARRAY['INCLUSIVE'::character varying, 'EXCLUSIVE'::character varying])::text[])) AND (tax_rate IS NOT NULL)))));
-- Modify "finance_allocations" table
ALTER TABLE "finance_allocations" ADD CONSTRAINT "finance_allocations_reversal_bundle" CHECK ((((status)::text = 'POSTED'::text) AND (reversal_of_allocation_id IS NULL)) OR (((status)::text = 'REVERSED'::text) AND (reversal_of_allocation_id IS NOT NULL))), ADD CONSTRAINT "finance_allocations_finance_allocations_reversals" FOREIGN KEY ("reversal_of_allocation_id") REFERENCES "finance_allocations" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, ADD CONSTRAINT "finance_allocations_finance_facts_allocations" FOREIGN KEY ("finance_fact_id") REFERENCES "finance_facts" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Modify "finance_credit_notes" table
ALTER TABLE "finance_credit_notes" ADD CONSTRAINT "finance_credit_notes_reversal_not_self" CHECK ((reversal_of_credit_note_id IS NULL) OR (reversal_of_credit_note_id <> id)), ADD CONSTRAINT "finance_credit_notes_finance_credit_notes_reversals" FOREIGN KEY ("reversal_of_credit_note_id") REFERENCES "finance_credit_notes" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, ADD CONSTRAINT "finance_credit_notes_finance_facts_credit_notes" FOREIGN KEY ("finance_fact_id") REFERENCES "finance_facts" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
