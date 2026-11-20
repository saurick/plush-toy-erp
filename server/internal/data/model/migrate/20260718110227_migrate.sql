-- Modify "processes" table
ALTER TABLE "processes" ADD CONSTRAINT "processes_production_route_operation_allowed" CHECK ((production_route_operation_code IS NULL) OR ((production_route_operation_code)::text = ANY ((ARRAY['FABRIC_PROCESSING'::character varying, 'SEWING'::character varying, 'HANDWORK'::character varying, 'PACKAGING'::character varying])::text[]))), ADD COLUMN "production_route_operation_code" character varying NULL;
-- Create index "process_production_route_operation_code" to table: "processes"
CREATE UNIQUE INDEX "process_production_route_operation_code" ON "processes" ("production_route_operation_code") WHERE (production_route_operation_code IS NOT NULL);
-- Modify "production_wip_events" table
ALTER TABLE "production_wip_events" DROP CONSTRAINT "production_wip_events_action_allowed", ADD CONSTRAINT "production_wip_events_action_allowed" CHECK ((action)::text = ANY ((ARRAY['SPLIT_BATCH'::character varying, 'ASSIGN_EXECUTION'::character varying, 'START_OPERATION'::character varying, 'COMPLETE_OPERATION'::character varying, 'WIP_TRANSFER'::character varying, 'OUTSOURCE_RETURN'::character varying, 'REWORK'::character varying, 'CANCEL'::character varying])::text[]));
