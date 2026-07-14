import { getRoleDisplayName } from './roleKeys.mjs'

export const ROLE_TYPE = Object.freeze({
  SYSTEM: 'system',
  BUSINESS_DEFAULT: 'business_default',
  CUSTOM: 'custom',
})

export const PERMISSION_CLASS = Object.freeze({
  BUSINESS: 'business',
  CONTROL_PLANE: 'control_plane',
  DEBUG: 'debug',
})

const CONTROL_TYPE_LABELS = Object.freeze({
  button: '操作按钮',
  form: '业务表单',
  link: '页面入口',
  menu: '页面入口',
  page: '页面入口与内容',
  switch: '启用或停用开关',
  table: '业务列表',
})

function normalizeString(value = '') {
  return String(value || '').trim()
}

function normalizeStringList(values = []) {
  return Array.isArray(values)
    ? values.map(normalizeString).filter(Boolean)
    : []
}

export function getPermissionCenterRoleKey(role = {}) {
  return normalizeString(role?.role_key || role?.key)
}

export function getPermissionCenterRoleName(role = {}) {
  const name = normalizeString(role?.name)
  return (
    name || getRoleDisplayName(getPermissionCenterRoleKey(role), '已配置角色')
  )
}

export function getPermissionCenterRoleVersion(role = {}) {
  const version = Number(role?.version)
  return Number.isSafeInteger(version) && version > 0 ? version : 0
}

export function isSystemRole(role = {}) {
  return normalizeString(role?.role_type) === ROLE_TYPE.SYSTEM
}

export function isAssignableBusinessRole(role = {}) {
  const roleKey = getPermissionCenterRoleKey(role)
  if (
    !roleKey ||
    role?.disabled === true ||
    role?.assignable_by_current_admin !== true
  ) {
    return false
  }
  return true
}

export function getRoleTypeLabel(role = {}) {
  switch (normalizeString(role?.role_type)) {
    case ROLE_TYPE.SYSTEM:
      return '产品系统角色'
    case ROLE_TYPE.BUSINESS_DEFAULT:
      return '业务默认角色'
    case ROLE_TYPE.CUSTOM:
      return '自定义角色'
    default:
      return '角色模板'
  }
}

export function getRolePermissionReadOnlyReason(
  role = {},
  { currentAdmin = {} } = {}
) {
  const roleKey = getPermissionCenterRoleKey(role)
  if (!roleKey) {
    return '当前角色资料不完整，请刷新后重试'
  }
  if (isSystemRole(role)) {
    return '产品系统角色由系统统一维护，只能查看；系统管理能力不会作为可分配业务功能展示'
  }
  if (role?.disabled === true) {
    return '该角色已经停用，只能查看，不能调整权限'
  }
  const currentRoleKeys = (
    Array.isArray(currentAdmin?.roles) ? currentAdmin.roles : []
  ).map(getPermissionCenterRoleKey)
  if (
    currentAdmin?.is_super_admin !== true &&
    currentRoleKeys.includes(roleKey)
  ) {
    return '当前登录账号正在使用该角色，不能修改其权限；请由不使用该角色的超级管理员处理'
  }
  if (role?.permissions_editable_by_current_admin !== true) {
    return (
      normalizeString(role?.permissions_edit_blocked_reason) ||
      '当前角色只能查看，不能调整权限'
    )
  }
  if (!getPermissionCenterRoleVersion(role)) {
    return '当前角色资料未完整加载，请刷新后再调整权限'
  }
  return ''
}

export function buildAssignableRoleOptions(roles = []) {
  if (!Array.isArray(roles)) return []

  return roles
    .filter((role) => isAssignableBusinessRole(role))
    .map((role) => ({
      label: getPermissionCenterRoleName(role),
      value: getPermissionCenterRoleKey(role),
    }))
}

export function isAssignableBusinessPermission(
  permission = {},
  { isProduction = false } = {}
) {
  const permissionKey = normalizeString(
    permission?.permission_key || permission?.key
  )
  const permissionClass = normalizeString(
    permission?.permission_class || permission?.class
  )
  if (
    !permissionKey ||
    permission?.assignable !== true ||
    permissionClass !== PERMISSION_CLASS.BUSINESS
  ) {
    return false
  }
  return !(isProduction && permission?.non_production_only === true)
}

export function filterAssignableBusinessPermissions(
  permissions = [],
  { isProduction = false } = {}
) {
  if (!Array.isArray(permissions)) return []
  return permissions.filter((permission) =>
    isAssignableBusinessPermission(permission, { isProduction })
  )
}

export function isSameAdminAccount(currentAdmin = {}, targetAdmin = {}) {
  const currentID = normalizeString(currentAdmin?.id)
  const targetID = normalizeString(targetAdmin?.id)
  return Boolean(currentID && targetID && currentID === targetID)
}

export function getAdminControlTargetBlockReason({
  currentAdmin = {},
  targetAdmin = {},
  roles = [],
} = {}) {
  if (!targetAdmin?.id) {
    return '账号资料不完整，请刷新后再操作'
  }
  if (targetAdmin?.is_super_admin === true) {
    return '超级管理员由系统保护，不能在这里维护'
  }
  if (currentAdmin?.is_super_admin === true) {
    return ''
  }

  const roleByKey = new Map(
    (Array.isArray(roles) ? roles : []).map((role) => [
      getPermissionCenterRoleKey(role),
      role,
    ])
  )
  for (const assignedRole of Array.isArray(targetAdmin?.roles)
    ? targetAdmin.roles
    : []) {
    const roleKey = getPermissionCenterRoleKey(assignedRole)
    const role = isSystemRole(assignedRole)
      ? assignedRole
      : roleByKey.get(roleKey)
    if (!roleKey || !role) {
      return '账号角色资料尚未完整加载，请刷新后再操作'
    }
    if (isSystemRole(role)) {
      return '该系统账号受保护，只有超级管理员可以维护'
    }
  }
  return ''
}

export function getRoleAssignmentBlockReason({
  currentAdmin = {},
  targetAdmin = {},
  roles = [],
  isProduction = false,
} = {}) {
  if (!targetAdmin?.id) return '账号资料不完整，暂时不能分配岗位角色'
  if (targetAdmin?.is_super_admin === true) {
    return '超级管理员由系统保护，不能在这里分配岗位角色'
  }
  const accountStatus = normalizeString(targetAdmin?.account_status)
  if (!['active', 'suspended', 'revoked'].includes(accountStatus)) {
    return '账号状态尚未完整加载，请刷新后再分配岗位角色'
  }
  if (accountStatus === 'revoked') {
    return '已注销账号不能再分配岗位角色'
  }
  if (isSameAdminAccount(currentAdmin, targetAdmin)) {
    return '当前登录账号不能修改自己的岗位角色'
  }

  const roleByKey = new Map(
    (Array.isArray(roles) ? roles : []).map((role) => [
      getPermissionCenterRoleKey(role),
      role,
    ])
  )
  const hasProtectedRole = (
    Array.isArray(targetAdmin?.roles) ? targetAdmin.roles : []
  ).some((assignedRole) => {
    const role = roleByKey.get(getPermissionCenterRoleKey(assignedRole))
    return !role || !isAssignableBusinessRole(role, { isProduction })
  })
  return hasProtectedRole
    ? '该账号包含受保护或不可分配的角色，不能在这里修改岗位角色'
    : ''
}

function controlTypeLabel(value = '') {
  const normalized = normalizeString(value)
  if (!normalized) return ''
  const knownLabel = CONTROL_TYPE_LABELS[normalized.toLowerCase()]
  if (knownLabel) return knownLabel
  return /^[a-z][a-z0-9_.:/-]*$/iu.test(normalized) ? '页面内操作' : normalized
}

function pageUsageEntry(page = {}) {
  return {
    pageLabel: normalizeString(page?.name) || '未登记页面',
    sectionLabel: normalizeString(page?.section_name),
    actionLabel:
      normalizeString(page?.control_name) ||
      controlTypeLabel(page?.control_type),
    restrictions: normalizeStringList(page?.conditions),
  }
}

function dedupe(values = []) {
  return [...new Set(values.filter(Boolean))]
}

export function normalizePermissionUsage(usage = {}) {
  const rawPages = Array.isArray(usage?.pages) ? usage.pages : []
  const pages = rawPages.map(pageUsageEntry)
  const actionLabels = dedupe(pages.map((page) => page.actionLabel))
  const outcomes = dedupe(rawPages.map((page) => normalizeString(page?.effect)))
  const restrictions = normalizeStringList(usage?.conditions)

  return {
    pages,
    backendOnly: usage?.backend_only === true,
    defaultActionLabel: actionLabels.join('、'),
    outcome: outcomes.join('；'),
    restrictions: dedupe([
      ...restrictions,
      ...pages.flatMap((page) => page.restrictions),
    ]),
  }
}
