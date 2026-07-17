-- Modify "outsourcing_order_items" table
ALTER TABLE "outsourcing_order_items" ADD COLUMN "processing_item" character varying NULL;
-- Modify "suppliers" table
ALTER TABLE "suppliers" ADD COLUMN "address" character varying NULL;
-- Create "supplier_process_capabilities" table
CREATE TABLE "supplier_process_capabilities" (
  "supplier_id" bigint NOT NULL,
  "process_id" bigint NOT NULL,
  PRIMARY KEY ("supplier_id", "process_id"),
  CONSTRAINT "supplier_process_capabilities_process_id" FOREIGN KEY ("process_id") REFERENCES "processes" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "supplier_process_capabilities_supplier_id" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
