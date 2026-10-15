import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { normalizeRoleKey } from './roleKeys.mjs'

// Viewing scope only; this is never assigned as a business role.
export const MOBILE_ALL_ROLES_KEY = 'all'

export const MOBILE_ROLE_PERMISSION_MAP = Object.freeze({
  boss: PermissionCode.MOBILE_BOSS_ACCESS,
  sales: PermissionCode.MOBILE_SALES_ACCESS,
  purchase: PermissionCode.MOBILE_PURCHASE_ACCESS,
  production: PermissionCode.MOBILE_PRODUCTION_ACCESS,
  warehouse: PermissionCode.MOBILE_WAREHOUSE_ACCESS,
  quality: PermissionCode.MOBILE_QUALITY_ACCESS,
  finance: PermissionCode.MOBILE_FINANCE_ACCESS,
  pmc: PermissionCode.MOBILE_PMC_ACCESS,
  engineering: PermissionCode.MOBILE_ENGINEERING_ACCESS,
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
  if (
    adminProfile?.is_super_admin === true &&
    !normalizeStringList(effectiveSession.roles).some(
      (role) => getMobileRolePermissionKey(role) === permissionKey
    )
  ) {
    return false
  }
  return normalizeStringList(effectiveSession.actions).includes(permissionKey)
}

export function getMobileRolePermissionKey(roleKey) {
  return MOBILE_ROLE_PERMISSION_MAP[normalizeRoleKey(roleKey)] || ''
}

export function hasMobileRoleAccountPermission(adminProfile, roleKey) {
  if (!adminProfile || adminProfile.disabled === true) return false
  const normalizedRole = normalizeRoleKey(roleKey)
  if (!normalizedRole) {
    return true
  }
  if (normalizedRole === MOBILE_ALL_ROLES_KEY) {
    return adminProfile.is_super_admin === true
  }
  const requiredPermission = getMobileRolePermissionKey(normalizedRole)
  if (!requiredPermission) {
    return false
  }
  if (adminProfile?.is_super_admin === true) {
    return true
  }
  const permissions = normalizeStringList(adminProfile?.permissions || [])
  return permissions.includes(requiredPermission)
}

export function hasMobileRolePermission(adminProfile, roleKey) {
  const normalizedRole = normalizeRoleKey(roleKey)
  if (!normalizedRole) {
    return true
  }
  if (normalizedRole === MOBILE_ALL_ROLES_KEY) {
    return (
      hasMobileRoleAccountPermission(adminProfile, normalizedRole) &&
      Object.keys(MOBILE_ROLE_PERMISSION_MAP).some((role) =>
        hasMobileRolePermission(adminProfile, role)
      )
    )
  }
  const requiredPermission = getMobileRolePermissionKey(normalizedRole)
  return (
    hasMobileRoleAccountPermission(adminProfile, normalizedRole) &&
    effectiveSessionAllowsMobileRole(adminProfile, requiredPermission)
  )
}

export function getAllowedMobileRoleKeys(adminProfile, roleKeys = []) {
  const allowed = normalizeStringList(roleKeys).filter((roleKey) =>
    roleKey !== MOBILE_ALL_ROLES_KEY && hasMobileRolePermission(adminProfile, roleKey)
  )
  return adminProfile?.is_super_admin === true && allowed.length > 0
    ? [MOBILE_ALL_ROLES_KEY, ...allowed]
    : allowed
}
