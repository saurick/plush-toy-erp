-- Modify "production_facts" table
ALTER TABLE "production_facts" ADD CONSTRAINT "production_facts_wip_source_allowed" CHECK ((production_wip_batch_id IS NULL) OR (((fact_type)::text = 'FINISHED_GOODS_RECEIPT'::text) AND ((source_type)::text = 'PRODUCTION_ORDER'::text) AND (source_id IS NOT NULL) AND (source_line_id IS NOT NULL))), ADD COLUMN "production_wip_batch_id" bigint NULL;
-- Create index "productionfact_production_wip_batch_id" to table: "production_facts"
CREATE INDEX "productionfact_production_wip_batch_id" ON "production_facts" ("production_wip_batch_id");
-- Modify "production_wip_batches" table
ALTER TABLE "production_wip_batches" DROP CONSTRAINT "production_wip_batches_rework_bundle", ADD CONSTRAINT "production_wip_batches_rework_bundle" CHECK ((((flow_type)::text = 'NORMAL'::text) AND (rework_reason IS NULL)) OR (((flow_type)::text = 'REWORK'::text) AND (rework_reason IS NOT NULL) AND ((length(TRIM(BOTH FROM rework_reason)) >= 1) AND (length(TRIM(BOTH FROM rework_reason)) <= 255)) AND ((source_batch_id IS NOT NULL) OR (origin_rework_fact_id IS NOT NULL)))), ADD COLUMN "origin_rework_fact_id" bigint NULL;
-- Create index "productionwipbatch_origin_rework_fact_id" to table: "production_wip_batches"
CREATE UNIQUE INDEX "productionwipbatch_origin_rework_fact_id" ON "production_wip_batches" ("origin_rework_fact_id") WHERE ((origin_rework_fact_id IS NOT NULL) AND (source_batch_id IS NULL));
-- Create index "productionwipbatch_origin_rework_fact_id_status" to table: "production_wip_batches"
CREATE INDEX "productionwipbatch_origin_rework_fact_id_status" ON "production_wip_batches" ("origin_rework_fact_id", "status");
-- Modify "production_facts" table
ALTER TABLE "production_facts" ADD CONSTRAINT "production_facts_production_wip_batches_completion_facts" FOREIGN KEY ("production_wip_batch_id") REFERENCES "production_wip_batches" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Modify "production_wip_batches" table
ALTER TABLE "production_wip_batches" ADD CONSTRAINT "production_wip_batches_production_facts_origin_rework_batches" FOREIGN KEY ("origin_rework_fact_id") REFERENCES "production_facts" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
