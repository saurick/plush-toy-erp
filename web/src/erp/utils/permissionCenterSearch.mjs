import { getRoleDisplayName } from './roleKeys.mjs'

export const ADMIN_ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
})

export const ADMIN_STATUS_FILTERS = Object.freeze({
  ALL: 'all',
  ACTIVE: ADMIN_ACCOUNT_STATUS.ACTIVE,
  SUSPENDED: ADMIN_ACCOUNT_STATUS.SUSPENDED,
  REVOKED: 'revoked',
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

function getRoleVisibleName(role = {}) {
  const name = String(role?.name || '').trim()
  if (name) return name
  return getRoleDisplayName(role?.role_key || role?.key, '已配置角色')
}

export function getAdminAccountStatus(admin = {}) {
  if (admin?.is_super_admin === true) return ADMIN_ACCOUNT_STATUS.ACTIVE
  const status = String(admin?.account_status || '').trim()
  return Object.values(ADMIN_ACCOUNT_STATUS).includes(status) ? status : ''
}

function getAdminStatusText(admin = {}) {
  if (admin.is_super_admin === true) {
    return '超级管理员 始终启用 启用 全部角色 全部权限'
  }
  switch (getAdminAccountStatus(admin)) {
    case ADMIN_ACCOUNT_STATUS.ACTIVE:
      return '普通管理员 启用'
    case ADMIN_ACCOUNT_STATUS.SUSPENDED:
      return '普通管理员 临时禁用 暂停'
    case ADMIN_ACCOUNT_STATUS.REVOKED:
      return '普通管理员 已注销 离职'
    default:
      return '普通管理员 状态待刷新'
  }
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
  if (normalizedStatus === ADMIN_STATUS_FILTERS.SUSPENDED) {
    return (
      admin.is_super_admin !== true &&
      getAdminAccountStatus(admin) === ADMIN_ACCOUNT_STATUS.SUSPENDED
    )
  }
  if (normalizedStatus === ADMIN_STATUS_FILTERS.REVOKED) {
    return (
      admin.is_super_admin !== true &&
      getAdminAccountStatus(admin) === ADMIN_ACCOUNT_STATUS.REVOKED
    )
  }
  if (normalizedStatus === ADMIN_STATUS_FILTERS.ACTIVE) {
    return getAdminAccountStatus(admin) === ADMIN_ACCOUNT_STATUS.ACTIVE
  }
  return true
}

export function matchesAdminKeyword(admin = {}, keyword = '') {
  const roles = normalizeList(admin.roles)
  const menus = normalizeList(admin.menus)
  const roleDisplayText =
    admin.is_super_admin === true || roles.length > 0 ? '' : '未分配角色'

  return includesKeyword(
    [
      admin.username,
      admin.phone,
      getAdminStatusText(admin),
      roleDisplayText,
      ...roles.map(getRoleVisibleName),
      ...menus.map((menu) => menu?.label),
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

      const matchedItems = items.filter((item) => {
        const pages = normalizeList(item?.usage?.pages)
        return includesKeyword(
          [
            item.label,
            item.description,
            item?.usage?.defaultActionLabel,
            item?.usage?.outcome,
            ...normalizeList(item?.usage?.restrictions),
            ...pages.flatMap((page) => [
              page?.pageLabel,
              page?.sectionLabel,
              page?.actionLabel,
              ...normalizeList(page?.restrictions),
            ]),
          ],
          normalizedKeyword
        )
      })

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
