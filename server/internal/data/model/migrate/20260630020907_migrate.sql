-- Modify "quality_inspections" table
ALTER TABLE "quality_inspections" DROP CONSTRAINT "quality_inspections_materials_quality_inspections", ALTER COLUMN "material_id" DROP NOT NULL, ALTER COLUMN "purchase_receipt_id" DROP NOT NULL, ADD CONSTRAINT "quality_inspections_materials_quality_inspections" FOREIGN KEY ("material_id") REFERENCES "materials" ("id") ON UPDATE NO ACTION ON DELETE SET NULL;
