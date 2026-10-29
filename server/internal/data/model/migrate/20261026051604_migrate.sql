-- migration-risk: maintenance
-- affected-table: business_attachments, finance_credit_notes, finance_facts, outsourcing_return_dispositions
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true
-- Modify "business_attachments" table
ALTER TABLE "business_attachments" DROP CONSTRAINT "business_attachments_owner_type_allowed", ADD CONSTRAINT "business_attachments_owner_type_allowed" CHECK ((owner_type)::text = ANY ((ARRAY['sales_order'::character varying, 'purchase_order'::character varying, 'outsourcing_order'::character varying, 'purchase_receipt'::character varying, 'quality_inspection'::character varying, 'shipment'::character varying, 'finance_fact'::character varying, 'finance_payment'::character varying, 'production_fact'::character varying, 'outsourcing_fact'::character varying, 'product'::character varying, 'product_sku'::character varying, 'bom_header'::character varying, 'workflow_task'::character varying])::text[]));
-- Modify "finance_credit_notes" table
ALTER TABLE "finance_credit_notes" ADD CONSTRAINT "finance_credit_notes_direction_allowed" CHECK ((balance_direction)::text = ANY ((ARRAY['DECREASE'::character varying, 'INCREASE'::character varying])::text[])), ADD CONSTRAINT "finance_credit_notes_source_bundle" CHECK (((source_type IS NULL) AND (source_id IS NULL) AND ((balance_direction)::text = 'DECREASE'::text)) OR ((source_type IS NOT NULL) AND ((source_type)::text = ANY ((ARRAY['PURCHASE_RETURN'::character varying, 'PURCHASE_RECEIPT_ADJUSTMENT'::character varying])::text[])) AND (source_id IS NOT NULL) AND (source_id > 0))), ADD COLUMN "balance_direction" character varying NOT NULL DEFAULT 'DECREASE', ADD COLUMN "source_type" character varying NULL, ADD COLUMN "source_id" bigint NULL;
-- Create index "financecreditnote_source_type_source_id" to table: "finance_credit_notes"
CREATE INDEX "financecreditnote_source_type_source_id" ON "finance_credit_notes" ("source_type", "source_id");
-- Modify "finance_facts" table
ALTER TABLE "finance_facts" DROP CONSTRAINT "finance_facts_status_audit_bundle", ADD CONSTRAINT "finance_facts_status_audit_bundle" CHECK ((((status)::text = 'DRAFT'::text) AND (posted_at IS NULL) AND (posted_by IS NULL) AND (settled_at IS NULL) AND (settled_by IS NULL)) OR (((status)::text = 'POSTED'::text) AND (posted_at IS NOT NULL) AND (posted_by IS NOT NULL) AND (settled_at IS NULL) AND (settled_by IS NULL)) OR (((status)::text = 'SETTLED'::text) AND (posted_at IS NOT NULL) AND (posted_by IS NOT NULL) AND (settled_at IS NOT NULL) AND (settled_by IS NOT NULL)) OR (((status)::text = 'CANCELLED'::text) AND (((settled_at IS NULL) AND (settled_by IS NULL)) OR (((fact_type)::text = 'RECONCILIATION'::text) AND (settled_at IS NOT NULL) AND (settled_by IS NOT NULL))) AND (((posted_at IS NULL) AND (posted_by IS NULL)) OR ((posted_at IS NOT NULL) AND (posted_by IS NOT NULL)))));
-- Drop index "outsourcingreturndisposition_quality_inspection_id" from table: "outsourcing_return_dispositions"
DROP INDEX "outsourcingreturndisposition_quality_inspection_id";
-- Modify "outsourcing_return_dispositions" table
ALTER TABLE "outsourcing_return_dispositions" DROP CONSTRAINT "outsourcing_return_dispositions_wip_source", ADD CONSTRAINT "outsourcing_return_dispositions_wip_source" CHECK (((disposition_type)::text = 'RETURN_TO_VENDOR'::text) OR (production_wip_batch_id IS NOT NULL));
-- Create index "outsourcingreturndisposition_quality_inspection_id" to table: "outsourcing_return_dispositions"
CREATE INDEX "outsourcingreturndisposition_quality_inspection_id" ON "outsourcing_return_dispositions" ("quality_inspection_id");
