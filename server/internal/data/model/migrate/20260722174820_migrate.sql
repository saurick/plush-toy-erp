-- Modify "outsourcing_return_dispositions" table
ALTER TABLE "outsourcing_return_dispositions" ADD COLUMN "result_wip_batch_id" bigint NULL;
-- Drop index "productionexceptiondecision_decision_type_status_requested_at" from table: "production_exception_decisions"
DROP INDEX "productionexceptiondecision_decision_type_status_requested_at";
-- Modify "production_exception_decisions" table
ALTER TABLE "production_exception_decisions" ADD CONSTRAINT "production_exception_decisions_execution_allowed" CHECK ((execution_status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPLIED'::character varying, 'REVERSED'::character varying])::text[])), ADD CONSTRAINT "production_exception_decisions_execution_audit" CHECK ((((execution_status)::text = 'PENDING'::text) AND (executed_at IS NULL) AND (executed_by IS NULL) AND (reversed_at IS NULL) AND (reversed_by IS NULL) AND (reverse_reason IS NULL)) OR (((execution_status)::text = 'APPLIED'::text) AND (executed_at IS NOT NULL) AND (executed_by IS NOT NULL) AND (reversed_at IS NULL) AND (reversed_by IS NULL) AND (reverse_reason IS NULL)) OR (((execution_status)::text = 'REVERSED'::text) AND (executed_at IS NOT NULL) AND (executed_by IS NOT NULL) AND (reversed_at IS NOT NULL) AND (reversed_by IS NOT NULL) AND ((length(TRIM(BOTH FROM reverse_reason)) >= 1) AND (length(TRIM(BOTH FROM reverse_reason)) <= 255)))), ADD COLUMN "execution_status" character varying NOT NULL DEFAULT 'PENDING', ADD COLUMN "executed_by" bigint NULL, ADD COLUMN "executed_at" timestamptz NULL, ADD COLUMN "reversed_by" bigint NULL, ADD COLUMN "reversed_at" timestamptz NULL, ADD COLUMN "reverse_reason" character varying NULL;
-- Decisions approved before this migration already applied scrap/concession effects in the legacy transaction.
-- Preserve that fact state without treating over-issue authorization itself as a posted material issue.
UPDATE "production_exception_decisions"
SET "execution_status" = 'APPLIED',
    "executed_by" = "decided_by",
    "executed_at" = "decided_at"
WHERE "status" = 'APPROVED'
  AND "decision_type" IN ('SCRAP', 'WIP_CONCESSION');
-- Create index "productionexceptiondecision_decision_type_status_execution_stat" to table: "production_exception_decisions"
CREATE INDEX "productionexceptiondecision_decision_type_status_execution_stat" ON "production_exception_decisions" ("decision_type", "status", "execution_status", "requested_at");
-- Rebuild the unchanged order lookup index so the compact schema-line change has explicit versioned DDL proof.
DROP INDEX "productionexceptiondecision_production_order_id_production_orde";
CREATE INDEX "productionexceptiondecision_production_order_id_production_orde" ON "production_exception_decisions" ("production_order_id", "production_order_item_id");
-- Drop index "purchaserejectiondisposition_quality_inspection_id" from table: "purchase_rejection_dispositions"
DROP INDEX "purchaserejectiondisposition_quality_inspection_id";
-- Modify "purchase_rejection_dispositions" table
ALTER TABLE "purchase_rejection_dispositions" ADD COLUMN "replacement_receipt_id" bigint NULL, ADD CONSTRAINT "purchase_rejection_dispositions_purchase_receipts_replacement_d" FOREIGN KEY ("replacement_receipt_id") REFERENCES "purchase_receipts" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "purchaserejectiondisposition_quality_inspection_id_status" to table: "purchase_rejection_dispositions"
CREATE INDEX "purchaserejectiondisposition_quality_inspection_id_status" ON "purchase_rejection_dispositions" ("quality_inspection_id", "status");
-- Create index "purchaserejectiondisposition_replacement_receipt_id" to table: "purchase_rejection_dispositions"
CREATE UNIQUE INDEX "purchaserejectiondisposition_replacement_receipt_id" ON "purchase_rejection_dispositions" ("replacement_receipt_id") WHERE (replacement_receipt_id IS NOT NULL);
