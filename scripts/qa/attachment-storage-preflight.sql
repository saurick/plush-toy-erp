-- Read-only attachment migration inventory. The Atlas data migration also rejects
-- a missing or stale export receipt before allowing the content column to retire.
SELECT current_database() AS database_name, count(*) AS attachment_count,
       coalesce(sum(file_size), 0) AS file_bytes,
       encode(sha256(convert_to(current_database() || E'\n' ||
         coalesce(string_agg(id::text || ':' || file_size::text || ':' || sha256, E'\n' ORDER BY id), ''), 'UTF8')), 'hex') AS export_fingerprint
FROM business_attachments;
