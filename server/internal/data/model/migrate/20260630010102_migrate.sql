-- Modify "quality_inspections" table
ALTER TABLE "quality_inspections" ADD COLUMN "source_type" character varying NULL, ADD COLUMN "source_id" bigint NULL, ADD COLUMN "inspection_type" character varying NULL, ADD COLUMN "subject_type" character varying NULL, ADD COLUMN "subject_id" bigint NULL;
-- Create index "qualityinspection_inspection_type" to table: "quality_inspections"
CREATE INDEX "qualityinspection_inspection_type" ON "quality_inspections" ("inspection_type");
-- Create index "qualityinspection_source_type_source_id" to table: "quality_inspections"
CREATE INDEX "qualityinspection_source_type_source_id" ON "quality_inspections" ("source_type", "source_id");
-- Create index "qualityinspection_subject_type_subject_id" to table: "quality_inspections"
CREATE INDEX "qualityinspection_subject_type_subject_id" ON "quality_inspections" ("subject_type", "subject_id");
