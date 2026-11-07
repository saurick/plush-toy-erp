-- migration-risk: maintenance
-- affected-table: business_attachments
-- expected-lock: ACCESS EXCLUSIVE during validation of the widened slot constraint
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore-reviewed-pre-migration-backup-and-previous-runtime
-- maintenance-required: true

-- Modify "business_attachments" table
ALTER TABLE "business_attachments" DROP CONSTRAINT "business_attachments_product_image_contract", ADD CONSTRAINT "business_attachments_product_image_contract" CHECK ((((owner_type)::text = 'product'::text) AND ((attachment_type)::text = 'product_image'::text) AND (slot_key IS NOT NULL) AND ((slot_key)::text = ANY ((ARRAY['primary'::character varying, 'secondary'::character varying, 'supplemental_1'::character varying, 'supplemental_2'::character varying, 'supplemental_3'::character varying, 'supplemental_4'::character varying, 'supplemental_5'::character varying, 'supplemental_6'::character varying, 'supplemental_7'::character varying, 'supplemental_8'::character varying])::text[])) AND ((mime_type)::text = ANY ((ARRAY['image/png'::character varying, 'image/jpeg'::character varying, 'image/webp'::character varying])::text[]))) OR (((owner_type)::text <> 'product'::text) AND ((attachment_type)::text <> 'product_image'::text)));
