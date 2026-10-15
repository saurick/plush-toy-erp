-- Normalize this project's pre-migration shipment reminder value to the canonical business state.
UPDATE "workflow_tasks"
SET "business_status_key" = 'shipment_pending'
WHERE "business_status_key" = 'shipment_release_pending';

UPDATE "workflow_business_states"
SET "business_status_key" = 'shipment_pending'
WHERE "business_status_key" = 'shipment_release_pending';
