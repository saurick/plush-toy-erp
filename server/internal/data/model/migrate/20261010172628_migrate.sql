-- migration-risk: maintenance
-- affected-table: production_wip_batches
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/production-task-upgrade-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

-- Modify "production_wip_batches" table
ALTER TABLE "production_wip_batches" ADD COLUMN "finished_goods_receipt_id" bigint NULL, ADD CONSTRAINT "production_wip_batches_production_facts_packaging_batches" FOREIGN KEY ("finished_goods_receipt_id") REFERENCES "production_facts" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "productionwipbatch_finished_goods_receipt_id_status" to table: "production_wip_batches"
CREATE INDEX "productionwipbatch_finished_goods_receipt_id_status" ON "production_wip_batches" ("finished_goods_receipt_id", "status");
