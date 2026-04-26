import {
  getMobileRolePermissionLabel,
  getPermissionLabel,
} from '../config/menuPermissions.mjs'

export const ADMIN_STATUS_FILTERS = Object.freeze({
  ALL: 'all',
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  SUPER: 'super',
})

const ADMIN_LEVEL_SUPER = 0

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

function getAdminStatusText(admin = {}) {
  if (Number(admin.level) === ADMIN_LEVEL_SUPER) {
    return '超级管理员 始终启用 启用 全部菜单 全部移动端'
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
    return Number(admin.level) === ADMIN_LEVEL_SUPER
  }
  if (normalizedStatus === ADMIN_STATUS_FILTERS.DISABLED) {
    return Number(admin.level) !== ADMIN_LEVEL_SUPER && Boolean(admin.disabled)
  }
  if (normalizedStatus === ADMIN_STATUS_FILTERS.ENABLED) {
    return Number(admin.level) === ADMIN_LEVEL_SUPER || !admin.disabled
  }
  return true
}

export function matchesAdminKeyword(admin = {}, keyword = '') {
  const menuPermissions = Array.isArray(admin.menu_permissions)
    ? admin.menu_permissions
    : []
  const mobileRolePermissions = Array.isArray(admin.mobile_role_permissions)
    ? admin.mobile_role_permissions
    : []
  const permissionDisplayText =
    Number(admin.level) === ADMIN_LEVEL_SUPER || menuPermissions.length > 0
      ? ''
      : '无菜单权限'
  const mobileRoleDisplayText =
    Number(admin.level) === ADMIN_LEVEL_SUPER ||
    mobileRolePermissions.length > 0
      ? ''
      : '未开通'

  return includesKeyword(
    [
      admin.username,
      admin.phone,
      getAdminStatusText(admin),
      permissionDisplayText,
      mobileRoleDisplayText,
      ...menuPermissions,
      ...menuPermissions.map((key) => getPermissionLabel(key)),
      ...mobileRolePermissions,
      ...mobileRolePermissions.map((key) => getMobileRolePermissionLabel(key)),
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
