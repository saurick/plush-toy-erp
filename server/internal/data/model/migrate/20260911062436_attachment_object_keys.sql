-- migration-risk: maintenance
-- affected-table: business_attachments
-- expected-lock: ROW EXCLUSIVE
-- preflight: scripts/qa/attachment-storage-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true
-- Existing files must have been exported and read back before retiring their bytes.
-- The receipt binds the stopped-writer set; any new/replaced/deleted row invalidates it.
UPDATE business_attachments
SET object_key = 'attachments/' || encode(sha256(convert_to(id::text || ':' || sha256, 'UTF8')), 'hex')
WHERE 1 = (
  SELECT 1 / CASE WHEN count(*) = 0 OR
    current_setting('plush.attachment_export_sha256', true) =
      encode(sha256(convert_to(current_database() || E'\n' ||
        coalesce(string_agg(id::text || ':' || file_size::text || ':' || sha256, E'\n' ORDER BY id), ''), 'UTF8')), 'hex')
    THEN 1 ELSE 0 END
  FROM business_attachments
);
