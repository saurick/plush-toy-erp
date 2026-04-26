export const ADMIN_STATUS_FILTERS = Object.freeze({
  ALL: 'all',
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  SUPER: 'super',
})

function normalizeSearchValue(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function includesKeyword(parts = [], keyword = '') {
  const normalizedKeyword = normalizeSearchValue(keyword)
  if (!normalizedKeyword) {
    return true
  }

  return parts.some((part) =>
    normalizeSearchValue(part).includes(normalizedKeyword)
  )
}

function normalizeList(values = []) {
  return Array.isArray(values) ? values : []
}

function getRoleKey(role = {}) {
  return role?.role_key || role?.key || ''
}

function getPermissionKey(permission = {}) {
  return typeof permission === 'string'
    ? permission
    : permission?.permission_key || permission?.key || ''
}

function getAdminStatusText(admin = {}) {
  if (admin.is_super_admin === true) {
    return '超级管理员 始终启用 启用 全部角色 全部权限'
  }
  return admin.disabled ? '普通管理员 禁用' : '普通管理员 启用'
}

export function matchesAdminStatus(
  admin = {},
  status = ADMIN_STATUS_FILTERS.ALL
) {
  const normalizedStatus = String(status || ADMIN_STATUS_FILTERS.ALL)
  if (normalizedStatus === ADMIN_STATUS_FILTERS.ALL) {
    return true
  }
  if (normalizedStatus === ADMIN_STATUS_FILTERS.SUPER) {
    return admin.is_super_admin === true
  }
  if (normalizedStatus === ADMIN_STATUS_FILTERS.DISABLED) {
    return admin.is_super_admin !== true && Boolean(admin.disabled)
  }
  if (normalizedStatus === ADMIN_STATUS_FILTERS.ENABLED) {
    return admin.is_super_admin === true || !admin.disabled
  }
  return true
}

export function matchesAdminKeyword(admin = {}, keyword = '') {
  const roles = normalizeList(admin.roles)
  const permissions = normalizeList(admin.permissions)
  const menus = normalizeList(admin.menus)
  const roleDisplayText =
    admin.is_super_admin === true || roles.length > 0 ? '' : '未分配角色'
  const permissionDisplayText =
    admin.is_super_admin === true || permissions.length > 0 ? '' : '无权限'

  return includesKeyword(
    [
      admin.username,
      admin.phone,
      getAdminStatusText(admin),
      roleDisplayText,
      permissionDisplayText,
      ...roles.flatMap((role) => [getRoleKey(role), role.name]),
      ...permissions.flatMap((permission) => [
        getPermissionKey(permission),
        permission?.name,
        permission?.module,
      ]),
      ...menus.flatMap((menu) => [menu?.path, menu?.label]),
    ],
    keyword
  )
}

export function filterAdminRecords(
  admins = [],
  { keyword = '', status = ADMIN_STATUS_FILTERS.ALL } = {}
) {
  if (!Array.isArray(admins)) {
    return []
  }

  return admins.filter(
    (admin) =>
      matchesAdminStatus(admin, status) && matchesAdminKeyword(admin, keyword)
  )
}

export function filterPermissionGroups(permissionGroups = [], keyword = '') {
  if (!Array.isArray(permissionGroups)) {
    return []
  }

  const normalizedKeyword = normalizeSearchValue(keyword)
  if (!normalizedKeyword) {
    return permissionGroups
  }

  return permissionGroups
    .map((section) => {
      const items = Array.isArray(section.items) ? section.items : []
      if (includesKeyword([section.title], normalizedKeyword)) {
        return section
      }

      const matchedItems = items.filter((item) =>
        includesKeyword([item.label, item.key], normalizedKeyword)
      )

      if (matchedItems.length === 0) {
        return null
      }

      return {
        ...section,
        items: matchedItems,
      }
    })
    .filter(Boolean)
}
