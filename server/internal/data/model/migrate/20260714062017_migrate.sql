-- Modify "quality_inspections" table
ALTER TABLE "quality_inspections" DROP CONSTRAINT "quality_inspections_materials_quality_inspections", ADD CONSTRAINT "quality_inspections_materials_quality_inspections" FOREIGN KEY ("material_id") REFERENCES "materials" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
