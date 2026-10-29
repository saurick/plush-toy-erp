import { normalizeStringList } from './permissionCenterAccess.mjs'

export function readRolePermissionPolicy(role = {}) {
  const policy = role?.permission_policy
  const registered =
    policy?.registered === true &&
    policy.template_key === role.role_key &&
    Array.isArray(policy.required_permissions) &&
    policy.required_permissions.length > 0 &&
    Array.isArray(policy.optional_permissions)
  const required = registered
    ? normalizeStringList(policy.required_permissions)
    : []
  const optional = registered
    ? normalizeStringList(policy.optional_permissions)
    : []
  const allowed = new Set([...required, ...optional])
  const granted = normalizeStringList(role?.permissions)
  return {
    registered,
    required,
    optional,
    allowed,
    missing: required.filter((key) => !granted.includes(key)),
    outside: registered ? granted.filter((key) => !allowed.has(key)) : [],
  }
}

export function constrainRolePermissionSelection(role, requested = []) {
  const policy = readRolePermissionPolicy(role)
  if (!policy.registered) return normalizeStringList(role?.permissions)
  return [
    ...new Set([
      ...policy.required,
      ...normalizeStringList(requested).filter((key) =>
        policy.allowed.has(key)
      ),
    ]),
  ]
}
