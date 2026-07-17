-- Product images are a new governed attachment type. Fail closed if legacy rows
-- reused the same free-form value; they must be reviewed instead of rewritten.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "business_attachments"
    WHERE "attachment_type" = 'product_image'
  ) THEN
    RAISE EXCEPTION 'legacy product_image attachments must be reviewed before applying this migration';
  END IF;
END
$$;

-- Modify "business_attachments" table
ALTER TABLE "business_attachments" DROP CONSTRAINT "business_attachments_owner_type_allowed", ADD CONSTRAINT "business_attachments_owner_type_allowed" CHECK ((owner_type)::text = ANY ((ARRAY['sales_order'::character varying, 'purchase_order'::character varying, 'outsourcing_order'::character varying, 'purchase_receipt'::character varying, 'quality_inspection'::character varying, 'shipment'::character varying, 'finance_fact'::character varying, 'production_fact'::character varying, 'outsourcing_fact'::character varying, 'product'::character varying, 'product_sku'::character varying, 'bom_header'::character varying, 'workflow_task'::character varying])::text[])), ADD CONSTRAINT "business_attachments_product_image_contract" CHECK ((((owner_type)::text = 'product'::text) AND ((attachment_type)::text = 'product_image'::text) AND (slot_key IS NOT NULL) AND ((slot_key)::text = ANY ((ARRAY['primary'::character varying, 'secondary'::character varying])::text[])) AND ((mime_type)::text = ANY ((ARRAY['image/png'::character varying, 'image/jpeg'::character varying, 'image/webp'::character varying])::text[]))) OR (((owner_type)::text <> 'product'::text) AND ((attachment_type)::text <> 'product_image'::text)));
-- Create index "businessattachment_owner_type_owner_id_attachment_type_slot_key" to table: "business_attachments"
CREATE UNIQUE INDEX "businessattachment_owner_type_owner_id_attachment_type_slot_key" ON "business_attachments" ("owner_type", "owner_id", "attachment_type", "slot_key") WHERE (((owner_type)::text = 'product'::text) AND ((attachment_type)::text = 'product_image'::text));
