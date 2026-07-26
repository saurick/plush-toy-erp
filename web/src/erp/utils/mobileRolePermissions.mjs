import { normalizeRoleKey } from './roleKeys.mjs'

export const MOBILE_ROLE_PERMISSION_MAP = Object.freeze({
  boss: 'mobile.boss.access',
  sales: 'mobile.sales.access',
  purchase: 'mobile.purchase.access',
  production: 'mobile.production.access',
  warehouse: 'mobile.warehouse.access',
  quality: 'mobile.quality.access',
  finance: 'mobile.finance.access',
  pmc: 'mobile.pmc.access',
  engineering: 'mobile.engineering.access',
})

function normalizeStringList(values = []) {
  return Array.isArray(values)
    ? values.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function effectiveSessionAllowsMobileRole(adminProfile, permissionKey) {
  const effectiveSession = adminProfile?.effective_session
  if (!effectiveSession || typeof effectiveSession !== 'object') {
    return true
  }
  return normalizeStringList(effectiveSession.actions).includes(permissionKey)
}

export function getMobileRolePermissionKey(roleKey) {
  return MOBILE_ROLE_PERMISSION_MAP[normalizeRoleKey(roleKey)] || ''
}

export function hasMobileRoleAccountPermission(adminProfile, roleKey) {
  const normalizedRole = normalizeRoleKey(roleKey)
  if (!normalizedRole) {
    return true
  }
  const requiredPermission = getMobileRolePermissionKey(normalizedRole)
  if (!requiredPermission) {
    return false
  }
  if (adminProfile?.is_super_admin === true) {
    const assigned = normalizeStringList(
      (adminProfile?.roles || []).map((role) => role?.role_key || role?.key)
    )
      .map((assignedRoleKey) => normalizeRoleKey(assignedRoleKey))
      .includes(normalizedRole)
    return assigned
  }
  const permissions = normalizeStringList(adminProfile?.permissions || [])
  return permissions.includes(requiredPermission)
}

export function hasMobileRolePermission(adminProfile, roleKey) {
  const normalizedRole = normalizeRoleKey(roleKey)
  if (!normalizedRole) {
    return true
  }
  const requiredPermission = getMobileRolePermissionKey(normalizedRole)
  return (
    hasMobileRoleAccountPermission(adminProfile, normalizedRole) &&
    effectiveSessionAllowsMobileRole(adminProfile, requiredPermission)
  )
}

export function getAllowedMobileRoleKeys(adminProfile, roleKeys = []) {
  return normalizeStringList(roleKeys).filter((roleKey) =>
    hasMobileRolePermission(adminProfile, roleKey)
  )
}
