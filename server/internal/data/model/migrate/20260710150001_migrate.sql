-- Modify "inventory_lots" table
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_sku_subject_allowed" CHECK ((product_sku_id IS NULL) OR ((subject_type)::text = 'PRODUCT'::text));
-- Modify "process_node_instances" table
ALTER TABLE "process_node_instances" ADD COLUMN "domain_command_protocol_version" bigint NULL, ADD COLUMN "domain_command_result_state" character varying NULL, ADD COLUMN "domain_command_result" jsonb NULL, ADD COLUMN "domain_command_result_hash" character varying NULL, ADD COLUMN "domain_command_effect_state" character varying NULL, ADD COLUMN "domain_command_effect_ref_type" character varying NULL, ADD COLUMN "domain_command_effect_ref_id" bigint NULL, ADD COLUMN "domain_command_result_recorded_at" timestamptz NULL, ADD COLUMN "domain_command_result_recorded_by" bigint NULL, ADD COLUMN "domain_command_compensation" jsonb NULL, ADD COLUMN "domain_command_compensation_hash" character varying NULL, ADD COLUMN "domain_command_compensated_at" timestamptz NULL, ADD COLUMN "domain_command_compensated_by" bigint NULL;
-- Existing fingerprints predate durable command results. Mark them as legacy so
-- active nodes fail closed instead of inferring whether a domain effect happened.
UPDATE "process_node_instances"
SET "domain_command_protocol_version" = 0
WHERE "node_type" = 'domain_command'
  AND "domain_command_fingerprint" IS NOT NULL;
-- Create index "processnodeinstance_domain_command_effect_ref_type_domain_comma" to table: "process_node_instances"
CREATE INDEX "processnodeinstance_domain_command_effect_ref_type_domain_comma" ON "process_node_instances" ("domain_command_effect_ref_type", "domain_command_effect_ref_id");
-- Drop index "inventorybalance_subject_type_subject_id_warehouse_id_unit_id" from table: "inventory_balances"
DROP INDEX "inventorybalance_subject_type_subject_id_warehouse_id_unit_id";
-- Drop index "inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l" from table: "inventory_balances"
DROP INDEX "inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l";
-- Modify "inventory_balances" table
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_sku_subject_allowed" CHECK ((product_sku_id IS NULL) OR ((subject_type)::text = 'PRODUCT'::text)), ADD COLUMN "product_sku_id" bigint NULL, ADD CONSTRAINT "inventory_balances_product_skus_inventory_balances" FOREIGN KEY ("product_sku_id") REFERENCES "product_skus" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "inventorybalance_subject_type_subject_id_warehouse_id_unit_id" to table: "inventory_balances"
CREATE UNIQUE INDEX "inventorybalance_subject_type_subject_id_warehouse_id_unit_id" ON "inventory_balances" ("subject_type", "subject_id", "warehouse_id", "unit_id") WHERE ((product_sku_id IS NULL) AND (lot_id IS NULL));
-- Create index "inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l" to table: "inventory_balances"
CREATE UNIQUE INDEX "inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l" ON "inventory_balances" ("subject_type", "subject_id", "warehouse_id", "unit_id", "lot_id") WHERE ((product_sku_id IS NULL) AND (lot_id IS NOT NULL));
-- Create index "inventorybalance_sku_lot" to table: "inventory_balances"
CREATE UNIQUE INDEX "inventorybalance_sku_lot" ON "inventory_balances" ("subject_type", "subject_id", "product_sku_id", "warehouse_id", "unit_id", "lot_id") WHERE ((product_sku_id IS NOT NULL) AND (lot_id IS NOT NULL));
-- Create index "inventorybalance_sku_no_lot" to table: "inventory_balances"
CREATE UNIQUE INDEX "inventorybalance_sku_no_lot" ON "inventory_balances" ("subject_type", "subject_id", "product_sku_id", "warehouse_id", "unit_id") WHERE ((product_sku_id IS NOT NULL) AND (lot_id IS NULL));
-- Modify "inventory_txns" table
ALTER TABLE "inventory_txns" ADD CONSTRAINT "inventory_txns_sku_subject_allowed" CHECK ((product_sku_id IS NULL) OR ((subject_type)::text = 'PRODUCT'::text)), ADD COLUMN "product_sku_id" bigint NULL, ADD CONSTRAINT "inventory_txns_product_skus_inventory_txns" FOREIGN KEY ("product_sku_id") REFERENCES "product_skus" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "inventorytxn_product_sku_id" to table: "inventory_txns"
CREATE INDEX "inventorytxn_product_sku_id" ON "inventory_txns" ("product_sku_id");
-- Modify "outsourcing_facts" table
ALTER TABLE "outsourcing_facts" ADD CONSTRAINT "outsourcing_facts_sku_subject_allowed" CHECK ((product_sku_id IS NULL) OR ((subject_type)::text = 'PRODUCT'::text)), ADD COLUMN "product_sku_id" bigint NULL, ADD CONSTRAINT "outsourcing_facts_product_skus_outsourcing_facts" FOREIGN KEY ("product_sku_id") REFERENCES "product_skus" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "outsourcingfact_product_sku_id" to table: "outsourcing_facts"
CREATE INDEX "outsourcingfact_product_sku_id" ON "outsourcing_facts" ("product_sku_id");
-- Modify "production_facts" table
ALTER TABLE "production_facts" ADD CONSTRAINT "production_facts_sku_subject_allowed" CHECK ((product_sku_id IS NULL) OR ((subject_type)::text = 'PRODUCT'::text)), ADD COLUMN "product_sku_id" bigint NULL, ADD CONSTRAINT "production_facts_product_skus_production_facts" FOREIGN KEY ("product_sku_id") REFERENCES "product_skus" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "productionfact_product_sku_id" to table: "production_facts"
CREATE INDEX "productionfact_product_sku_id" ON "production_facts" ("product_sku_id");
