-- Fail closed for active domain-command nodes created before intent fingerprints existed.
UPDATE "process_node_instances"
SET "domain_command_fingerprint" = repeat('0', 64)
WHERE "node_type" = 'domain_command'
  AND "status" = 'active'
  AND "domain_command_fingerprint" IS NULL;
