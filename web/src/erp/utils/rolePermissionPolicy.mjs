import { normalizeStringList } from './permissionCenterAccess.mjs'

export function readRolePermissionPolicy(role = {}) {
  const policy = role?.permission_policy
  const registered =
    policy?.registered === true &&
    policy.template_key === role.role_key &&
    Array.isArray(policy.default_permissions) &&
    Array.isArray(policy.assignable_permissions) &&
    policy.assignable_permissions.length > 0
  const defaults = registered
    ? normalizeStringList(policy.default_permissions)
    : []
  const assignable = registered
    ? normalizeStringList(policy.assignable_permissions)
    : []
  const allowed = new Set(assignable)
  const granted = normalizeStringList(role?.permissions)
  return {
    registered,
    defaults,
    allowed,
    outside: registered ? granted.filter((key) => !allowed.has(key)) : [],
  }
}

export function constrainRolePermissionSelection(role, requested = []) {
  const policy = readRolePermissionPolicy(role)
  if (!policy.registered) return normalizeStringList(role?.permissions)
  return [...new Set(normalizeStringList(requested))].filter((key) =>
    policy.allowed.has(key)
  )
}
