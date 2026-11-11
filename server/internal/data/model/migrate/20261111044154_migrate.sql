-- migration-risk: maintenance
-- affected-table: business_attachments
-- expected-lock: ACCESS EXCLUSIVE while validating attachment ownership and adding the material image index
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

-- Modify "business_attachments" table
ALTER TABLE "business_attachments" DROP CONSTRAINT "business_attachments_owner_type_allowed", ADD CONSTRAINT "business_attachments_owner_type_allowed" CHECK ((owner_type)::text = ANY ((ARRAY['sales_order'::character varying, 'purchase_order'::character varying, 'outsourcing_order'::character varying, 'purchase_receipt'::character varying, 'quality_inspection'::character varying, 'shipment'::character varying, 'finance_fact'::character varying, 'finance_payment'::character varying, 'production_fact'::character varying, 'outsourcing_fact'::character varying, 'product'::character varying, 'product_sku'::character varying, 'bom_header'::character varying, 'workflow_task'::character varying, 'material'::character varying])::text[])), ADD CONSTRAINT "business_attachments_material_media_contract" CHECK ((((owner_type)::text = 'material'::text) AND ((((attachment_type)::text = 'evidence'::text) AND (slot_key IS NULL)) OR (((attachment_type)::text = 'material_image'::text) AND (slot_key IS NOT NULL) AND ((slot_key)::text = 'primary'::text) AND ((mime_type)::text = ANY ((ARRAY['image/png'::character varying, 'image/jpeg'::character varying, 'image/webp'::character varying])::text[])) AND (file_size <= 5242880) AND (withdrawn_at IS NULL)))) OR (((owner_type)::text <> 'material'::text) AND ((attachment_type)::text <> 'material_image'::text)));
-- Create index "businessattachment_material_image_owner_id" to table: "business_attachments"
CREATE UNIQUE INDEX "businessattachment_material_image_owner_id" ON "business_attachments" ("owner_id") WHERE (((owner_type)::text = 'material'::text) AND ((attachment_type)::text = 'material_image'::text));
