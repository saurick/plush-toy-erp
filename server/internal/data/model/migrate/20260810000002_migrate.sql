-- Modify "shipment_items" table
ALTER TABLE "shipment_items" DROP CONSTRAINT "shipment_items_rework_completion_positive", DROP COLUMN "rework_completion_fact_id";
-- Modify "shipments" table
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_purpose_allowed", DROP CONSTRAINT "shipments_purpose_source_bundle", DROP CONSTRAINT "shipments_finance_release_status_allowed", ADD CONSTRAINT "shipments_finance_release_status_allowed" CHECK ((finance_release_status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])), DROP COLUMN "purpose", DROP COLUMN "rework_intake_id";
-- Drop "rework_intake_items" table
DROP TABLE "rework_intake_items";
-- Drop "rework_intakes" table
DROP TABLE "rework_intakes";
