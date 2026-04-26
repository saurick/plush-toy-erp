import { normalizeRoleKey } from './roleKeys.mjs'

const MOBILE_ROLE_PERMISSION_MAP = Object.freeze({
  boss: 'mobile.boss.access',
  sales: 'mobile.sales.access',
  purchase: 'mobile.purchase.access',
  production: 'mobile.production.access',
  warehouse: 'mobile.warehouse.access',
  quality: 'mobile.quality.access',
  finance: 'mobile.finance.access',
  pmc: 'mobile.pmc.access',
})

function normalizeStringList(values = []) {
  return Array.isArray(values)
    ? values.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

function getRoleKeyFromOption(role = {}) {
  if (!role || typeof role !== 'object') {
    return ''
  }
  return normalizeRoleKey(role.role_key || role.key || '')
}

export function hasMobileRolePermission(adminProfile, roleKey) {
  const normalizedRole = normalizeRoleKey(roleKey)
  if (!normalizedRole) {
    return true
  }
  if (adminProfile?.is_super_admin === true) {
    return true
  }
  const requiredPermission = MOBILE_ROLE_PERMISSION_MAP[normalizedRole]
  if (!requiredPermission) {
    return true
  }
  const permissions = normalizeStringList(adminProfile?.permissions || [])
  if (permissions.includes(requiredPermission)) {
    return true
  }
  const roleKeys = normalizeStringList(
    (adminProfile?.roles || []).map(getRoleKeyFromOption)
  )
  return roleKeys.includes(normalizedRole)
}
