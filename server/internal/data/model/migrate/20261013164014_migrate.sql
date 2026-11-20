-- migration-risk: maintenance
-- affected-table: finance_payments,finance_allocations
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Modify "finance_allocations" table
ALTER TABLE "finance_allocations" ADD COLUMN "reason" character varying NULL;
-- Modify "finance_payments" table
ALTER TABLE "finance_payments" DROP CONSTRAINT "finance_payments_direction_party_pair", ADD CONSTRAINT "finance_payments_direction_party_pair" CHECK ((((kind)::text <> 'REFUND'::text) AND ((((direction)::text = 'RECEIPT'::text) AND ((counterparty_type)::text = 'CUSTOMER'::text)) OR (((direction)::text = 'DISBURSEMENT'::text) AND ((counterparty_type)::text = 'SUPPLIER'::text)))) OR (((kind)::text = 'REFUND'::text) AND ((((direction)::text = 'DISBURSEMENT'::text) AND ((counterparty_type)::text = 'CUSTOMER'::text)) OR (((direction)::text = 'RECEIPT'::text) AND ((counterparty_type)::text = 'SUPPLIER'::text))))), ADD CONSTRAINT "finance_payments_kind_source" CHECK ((((kind)::text = 'SETTLEMENT'::text) AND (source_type IS NULL) AND (source_id IS NULL) AND (refund_of_payment_id IS NULL)) OR (((kind)::text = 'ADVANCE'::text) AND (source_type IS NOT NULL) AND (source_id IS NOT NULL) AND (source_id > 0) AND (refund_of_payment_id IS NULL) AND ((((counterparty_type)::text = 'CUSTOMER'::text) AND ((source_type)::text = 'sales_order'::text)) OR (((counterparty_type)::text = 'SUPPLIER'::text) AND ((source_type)::text = ANY ((ARRAY['purchase_order'::character varying, 'outsourcing_order'::character varying])::text[]))))) OR (((kind)::text = 'REFUND'::text) AND (source_type IS NULL) AND (source_id IS NULL) AND (refund_of_payment_id IS NOT NULL) AND (refund_of_payment_id > 0) AND (refund_of_payment_id <> id) AND (purpose_note IS NOT NULL) AND ((length(TRIM(BOTH FROM purpose_note)) >= 1) AND (length(TRIM(BOTH FROM purpose_note)) <= 255)))), ADD COLUMN "kind" character varying NOT NULL DEFAULT 'SETTLEMENT', ADD COLUMN "source_type" character varying NULL, ADD COLUMN "source_id" bigint NULL, ADD COLUMN "purpose_note" character varying NULL, ADD COLUMN "refund_of_payment_id" bigint NULL, ADD CONSTRAINT "finance_payments_finance_payments_refunds" FOREIGN KEY ("refund_of_payment_id") REFERENCES "finance_payments" ("id") ON UPDATE NO ACTION ON DELETE SET NULL;
-- Create index "financepayment_refund_of_payment_id_status" to table: "finance_payments"
CREATE INDEX "financepayment_refund_of_payment_id_status" ON "finance_payments" ("refund_of_payment_id", "status");
-- Create index "financepayment_source_type_source_id" to table: "finance_payments"
CREATE INDEX "financepayment_source_type_source_id" ON "finance_payments" ("source_type", "source_id");
