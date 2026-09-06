import {
  getPermissionCenterRoleKey as getRoleKey,
  normalizePermissionUsage,
  normalizeStringList,
} from '../../utils/permissionCenterAccess.mjs'
import { ADMIN_STATUS_FILTERS } from '../../utils/permissionCenterSearch.mjs'
import {
  getPermissionModuleTitle,
  UNCLASSIFIED_PERMISSION_MODULE_TITLE,
} from '../../utils/permissionModuleLabels.mjs'
import { getPermissionMenuLinks } from '../../utils/permissionMenuProjection.mjs'
import {
  getAuthenticatedNavigationSections,
  getNavigationSections,
} from '../../config/seedData.mjs'
import {
  isRoleNavigationCustomizablePath,
  ROLE_NAVIGATION_MODES,
} from '../../config/roleGuidedNavigation.mjs'

const TABLE_PAGE_SIZE_OPTIONS = [8, 10, 20, 50, 100]

const IS_PRODUCTION_BUILD = import.meta.env.PROD === true

const READ_USER_PERMISSION = 'system.user.read'

const READ_ROLE_PERMISSION = 'system.role.read'

const READ_PERMISSION_PERMISSION = 'system.permission.read'

const READ_CUSTOMER_CONFIG_PERMISSION = 'customer_config.read'

const PUBLISH_CUSTOMER_CONFIG_PERMISSION = 'customer_config.publish'

const ACTIVATE_CUSTOMER_CONFIG_PERMISSION = 'customer_config.activate'

const MANAGE_ROLE_PERMISSION = 'system.role.permission.manage'

const UPDATE_USER_PERMISSION = 'system.user.update'

const ASSIGN_USER_ROLE_PERMISSION = 'system.user.role.assign'

const CREATE_USER_PERMISSION = 'system.user.create'

const DISABLE_USER_PERMISSION = 'system.user.disable'

const REVOKE_USER_PERMISSION = 'system.user.revoke'

const PERMISSION_CENTER_TAB_KEYS = {
  ROLES: 'roles',
  ADMINS: 'admins',
  APPROVALS: 'approvals',
}

const ROLE_NAVIGATION_VIEW_KEYS = {
  LAYOUT: 'layout',
  ACCESS: 'access',
}

const adminStatusOptions = [
  { label: '全部状态', value: ADMIN_STATUS_FILTERS.ALL },
  { label: '启用', value: ADMIN_STATUS_FILTERS.ACTIVE },
  { label: '临时停用', value: ADMIN_STATUS_FILTERS.SUSPENDED },
  { label: '已注销', value: ADMIN_STATUS_FILTERS.REVOKED },
  { label: '超级管理员', value: ADMIN_STATUS_FILTERS.SUPER },
]

function buildPermissionSignature(values = []) {
  return normalizeStringList(values).sort().join('\n')
}

function getRoleWarehouseScope(role = {}) {
  const scope = (Array.isArray(role?.data_scopes) ? role.data_scopes : []).find(
    (item) => item?.resource_type === 'warehouse'
  )
  const mode = ['ALL', 'ASSIGNED', 'NONE'].includes(scope?.mode)
    ? scope.mode
    : 'NONE'
  const warehouseIds = Array.isArray(scope?.resource_ids)
    ? [...new Set(scope.resource_ids.map(Number).filter((id) => id > 0))].sort(
        (left, right) => left - right
      )
    : []
  return {
    mode: mode === 'ASSIGNED' && warehouseIds.length === 0 ? 'NONE' : mode,
    warehouseIds: mode === 'ASSIGNED' ? warehouseIds : [],
  }
}

function buildWarehouseScopeSignature(mode, warehouseIds = []) {
  return `${mode}:${warehouseIds
    .map(Number)
    .filter((id) => id > 0)
    .sort((a, b) => a - b)
    .join(',')}`
}

function buildRoleNavigationSignature(
  mode,
  primaryMenuPaths = [],
  secondaryMenuPaths = []
) {
  const normalizedMode =
    mode === ROLE_NAVIGATION_MODES.CUSTOM
      ? ROLE_NAVIGATION_MODES.CUSTOM
      : ROLE_NAVIGATION_MODES.RECOMMENDED
  const normalizedPaths =
    normalizedMode === ROLE_NAVIGATION_MODES.CUSTOM
      ? normalizeStringList(primaryMenuPaths)
      : []
  const normalizedSecondaryPaths =
    normalizedMode === ROLE_NAVIGATION_MODES.CUSTOM
      ? normalizeStringList(secondaryMenuPaths)
      : []
  return `${normalizedMode}:${normalizedPaths.join('\n')}:${normalizedSecondaryPaths.join('\n')}`
}

function getEffectiveRoleNavigationPathSet(access = null) {
  return new Set(
    (Array.isArray(access?.pages) ? access.pages : [])
      .filter(
        (page) =>
          page?.effective === true &&
          isRoleNavigationCustomizablePath(page?.path)
      )
      .map((page) => String(page?.path || '').trim())
      .filter(Boolean)
  )
}

function buildRoleNavigationOptions(access = null, selectedPaths = []) {
  const navigationItems = [
    ...getNavigationSections(),
    ...getAuthenticatedNavigationSections(),
  ].flatMap((section, sectionIndex) =>
    (Array.isArray(section?.items) ? section.items : []).map((item) => ({
      ...item,
      navigationSectionKey:
        String(section?.key || '').trim() ||
        String(item?.navigationSectionKey || item?.sectionKey || '').trim(),
      navigationSectionTitle:
        String(section?.title || '').trim() ||
        String(item?.navigationSectionTitle || item?.sectionTitle || '').trim(),
      navigationSectionOrder: sectionIndex,
    }))
  )
  const itemByPath = new Map(
    navigationItems
      .filter((item) => isRoleNavigationCustomizablePath(item?.path))
      .map((item) => [item.path, item])
  )
  const effectivePaths = getEffectiveRoleNavigationPathSet(access)
  const paths = [
    ...effectivePaths,
    ...normalizeStringList(selectedPaths).filter(
      (path) => !effectivePaths.has(path)
    ),
  ]
  return paths.map((path) => {
    const item = itemByPath.get(path)
    const effective = effectivePaths.has(path)
    return {
      value: path,
      label: item?.label || path,
      effective,
      menuItem: item || {
        path,
        label: path,
        navigationSectionTitle: '其他功能',
      },
    }
  })
}

function getPermissionKey(permission = {}) {
  return String(
    permission?.permission_key || permission?.key || permission || ''
  ).trim()
}

function getPermissionVisibleName(permission = {}) {
  const name = String(permission?.name || '').trim()
  return name || '其他功能'
}

function roleKeysForAdmin(admin = {}) {
  return normalizeStringList((admin.roles || []).map(getRoleKey))
}

function permissionKeysForRole(role = {}) {
  return normalizeStringList(role.permissions || [])
}

function hasPermission(admin = {}, permissionKey = '') {
  if (admin?.is_super_admin === true) {
    return true
  }
  return normalizeStringList(admin?.permissions || []).includes(permissionKey)
}

function buildPermissionGroups(permissions = [], menuOptions = []) {
  const groups = new Map()
  const sourcePermissions = Array.isArray(permissions) ? permissions : []
  sourcePermissions.forEach((permission) => {
    const permissionKey = getPermissionKey(permission)
    if (!permissionKey) {
      return
    }
    const rawModuleKey =
      String(permission.module || 'unclassified').trim() || 'unclassified'
    const moduleTitle = getPermissionModuleTitle(permission.module_name)
    const moduleKey =
      moduleTitle === UNCLASSIFIED_PERMISSION_MODULE_TITLE
        ? 'unclassified'
        : rawModuleKey
    const group = groups.get(moduleKey) || {
      key: moduleKey,
      title: moduleTitle,
      items: [],
    }
    group.items.push({
      key: permissionKey,
      label: getPermissionVisibleName(permission),
      description: permission.description || '',
      action: String(permission.action || '').trim(),
      usage: normalizePermissionUsage(permission.usage || {}),
      menuLinks: getPermissionMenuLinks(permission, menuOptions),
    })
    groups.set(moduleKey, group)
  })
  return [...groups.values()].map((group) => ({
    ...group,
    items: group.items.sort((left, right) => left.key.localeCompare(right.key)),
  }))
}

function buildPermissionDetailMap(permissions = [], menuOptions = []) {
  const detailMap = new Map()
  const sourcePermissions = Array.isArray(permissions) ? permissions : []
  sourcePermissions.forEach((permission) => {
    const permissionKey = getPermissionKey(permission)
    if (!permissionKey) {
      return
    }
    detailMap.set(permissionKey, {
      key: permissionKey,
      label: getPermissionVisibleName(permission),
      module: String(permission.module || 'other').trim() || 'other',
      action: String(permission.action || '').trim(),
      resource: String(permission.resource || '').trim(),
      usage: normalizePermissionUsage(permission.usage || {}),
      menuLinks: getPermissionMenuLinks(permission, menuOptions),
    })
  })
  return detailMap
}

function adminsForRole(admins = [], roleKey = '') {
  const normalizedRoleKey = String(roleKey || '').trim()
  if (!normalizedRoleKey || !Array.isArray(admins)) {
    return []
  }
  return admins.filter((admin) =>
    roleKeysForAdmin(admin).includes(normalizedRoleKey)
  )
}

function summarizeRolePermissions(
  permissionKeys,
  permissionDetailMap = new Map()
) {
  return {
    total: normalizeStringList(permissionKeys).filter((permissionKey) =>
      permissionDetailMap.has(permissionKey)
    ).length,
  }
}

export {
  TABLE_PAGE_SIZE_OPTIONS,
  IS_PRODUCTION_BUILD,
  READ_USER_PERMISSION,
  READ_ROLE_PERMISSION,
  READ_PERMISSION_PERMISSION,
  READ_CUSTOMER_CONFIG_PERMISSION,
  PUBLISH_CUSTOMER_CONFIG_PERMISSION,
  ACTIVATE_CUSTOMER_CONFIG_PERMISSION,
  MANAGE_ROLE_PERMISSION,
  UPDATE_USER_PERMISSION,
  ASSIGN_USER_ROLE_PERMISSION,
  CREATE_USER_PERMISSION,
  DISABLE_USER_PERMISSION,
  REVOKE_USER_PERMISSION,
  PERMISSION_CENTER_TAB_KEYS,
  ROLE_NAVIGATION_VIEW_KEYS,
  adminStatusOptions,
  buildPermissionSignature,
  getRoleWarehouseScope,
  buildWarehouseScopeSignature,
  buildRoleNavigationSignature,
  getEffectiveRoleNavigationPathSet,
  buildRoleNavigationOptions,
  getPermissionKey,
  roleKeysForAdmin,
  permissionKeysForRole,
  hasPermission,
  buildPermissionGroups,
  buildPermissionDetailMap,
  adminsForRole,
  summarizeRolePermissions,
  getPermissionVisibleName,
}
