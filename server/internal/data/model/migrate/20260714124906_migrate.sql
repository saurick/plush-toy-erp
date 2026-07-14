-- Modify "purchase_returns" table
ALTER TABLE "purchase_returns" ADD COLUMN "quality_inspection_id" bigint NULL, ADD CONSTRAINT "purchase_returns_quality_inspections_purchase_returns" FOREIGN KEY ("quality_inspection_id") REFERENCES "quality_inspections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "purchasereturn_quality_inspection_id" to table: "purchase_returns"
CREATE INDEX "purchasereturn_quality_inspection_id" ON "purchase_returns" ("quality_inspection_id");
-- Create index "purchasereturn_quality_inspection_id_active" to table: "purchase_returns"
CREATE UNIQUE INDEX "purchasereturn_quality_inspection_id_active" ON "purchase_returns" ("quality_inspection_id") WHERE ((quality_inspection_id IS NOT NULL) AND ((status)::text <> 'CANCELLED'::text));
