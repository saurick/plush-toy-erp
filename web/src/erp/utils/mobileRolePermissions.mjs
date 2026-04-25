import { normalizeMobileRolePermissions } from '../config/menuPermissions.mjs'

export function hasMobileRolePermission(adminProfile, roleKey) {
  const normalizedRole = normalizeMobileRolePermissions([roleKey])[0]
  if (!normalizedRole) {
    return true
  }
  if (adminProfile?.level === 0 || adminProfile?.level === '0') {
    return true
  }
  return normalizeMobileRolePermissions(
    adminProfile?.mobile_role_permissions || []
  ).includes(normalizedRole)
}
