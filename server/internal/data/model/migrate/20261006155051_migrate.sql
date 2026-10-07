-- Drop index "productionexceptiondecision_quality_inspection_id" from table: "production_exception_decisions"
DROP INDEX "productionexceptiondecision_quality_inspection_id";
-- Create index "productionexceptiondecision_quality_inspection_id" to table: "production_exception_decisions"
CREATE UNIQUE INDEX "productionexceptiondecision_quality_inspection_id" ON "production_exception_decisions" ("quality_inspection_id") WHERE ((((decision_type)::text = 'SCRAP'::text) OR ((decision_type)::text = 'WIP_CONCESSION'::text)) AND (((status)::text = 'SUBMITTED'::text) OR ((status)::text = 'APPROVED'::text)) AND ((execution_status)::text <> 'REVERSED'::text));
