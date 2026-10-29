-- Engineering consumes process references; execution capabilities belong to production planning.
WITH removed AS (
  DELETE FROM role_permissions rp USING roles r, permissions p
  WHERE rp.role_id = r.id AND rp.permission_id = p.id
    AND r.role_key = 'engineering' AND r.role_type = 'business_default'
    AND p.permission_key IN ('process.create', 'process.update', 'process.disable')
  RETURNING rp.role_id
)
UPDATE roles SET version = version + 1, updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT role_id FROM removed);

-- migration-risk: online
-- preflight: retain role bindings in the verified backup
-- maintenance-required: no
-- affected-table: roles, role_permissions
-- expected-lock: row locks on the default engineering role and removed bindings
-- recovery: restore the verified backup and prior product version together
