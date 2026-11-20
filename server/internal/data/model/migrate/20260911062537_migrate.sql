-- migration-risk: maintenance
-- affected-table: business_attachments
-- expected-lock: ACCESS EXCLUSIVE
-- preflight: scripts/qa/attachment-storage-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true
-- The preceding export-proof migration must pass in the same stopped-writer operation.
-- Modify "business_attachments" table
ALTER TABLE "business_attachments" DROP CONSTRAINT "business_attachments_content_size_matches", ADD CONSTRAINT "business_attachments_object_key_shape" CHECK ((length((object_key)::text) = ANY (ARRAY[44, 76])) AND (substr((object_key)::text, 1, 12) = 'attachments/'::text) AND ((object_key)::text = lower((object_key)::text))), DROP COLUMN "content", ALTER COLUMN "object_key" SET NOT NULL;
-- Create index "businessattachment_object_key" to table: "business_attachments"
CREATE UNIQUE INDEX "businessattachment_object_key" ON "business_attachments" ("object_key");
