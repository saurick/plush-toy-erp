-- migration-risk: maintenance
-- affected-table: business_attachments
-- expected-lock: ACCESS EXCLUSIVE while replacing validated CHECK constraints
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

-- Modify "business_attachments" table
ALTER TABLE "business_attachments" DROP CONSTRAINT "business_attachments_content_size_matches", ADD CONSTRAINT "business_attachments_content_size_matches" CHECK (length(content) = file_size), DROP CONSTRAINT "business_attachments_sha256_lower_hex", ADD CONSTRAINT "business_attachments_sha256_lower_hex" CHECK ((length((sha256)::text) = 64) AND ((sha256)::text = lower((sha256)::text)));
