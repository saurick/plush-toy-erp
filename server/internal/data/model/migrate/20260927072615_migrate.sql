-- migration-risk: maintenance
-- affected-table: business_attachments
-- expected-lock: ACCESS EXCLUSIVE while replacing and validating attachment size CHECK constraints
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore a verified pre-migration backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true
-- Modify "business_attachments" table
ALTER TABLE "business_attachments" DROP CONSTRAINT "business_attachments_file_size_max", ADD CONSTRAINT "business_attachments_file_size_max" CHECK (file_size <= 104857600), ADD CONSTRAINT "business_attachments_product_image_size_max" CHECK (((attachment_type)::text <> 'product_image'::text) OR (file_size <= 5242880));
