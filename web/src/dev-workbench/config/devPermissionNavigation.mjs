import {
  getAuthenticatedNavigationSections,
  getNavigationSections,
} from '../../erp/config/seedData.mjs'
import {
  ROLE_NAVIGATION_MODES,
  buildRoleGuidedNavigation,
  buildRoleGuidedNavigationPreview,
  normalizeRoleNavigationSettings,
} from '../../erp/config/roleGuidedNavigation.mjs'
import {
  ADMIN_ACCOUNT_STATUS,
  getAdminAccountStatus,
} from '../../erp/utils/permissionCenterSearch.mjs'
import {
  getPermissionCenterRoleKey,
  getPermissionCenterRoleName,
} from '../../erp/utils/permissionCenterAccess.mjs'
import {
  PERMISSION_RELATIONSHIP_VIEW_MODE,
  getPermissionRelationshipRoleKeys,
} from './devPermissionRelationshipGraph.mjs'
import { formatAdminIdentity } from '../../erp/utils/adminIdentity.mjs'

export const PERMISSION_NAVIGATION_STATE = Object.freeze({
  READY: 'ready',
  BLOCKED: 'blocked',
  UNAVAILABLE: 'unavailable',
})

const ACCOUNT_STATUS_LABELS = Object.freeze({
  [ADMIN_ACCOUNT_STATUS.ACTIVE]: '启用',
  [ADMIN_ACCOUNT_STATUS.SUSPENDED]: '临时停用',
  [ADMIN_ACCOUNT_STATUS.REVOKED]: '已注销',
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeList(value = []) {
  return Array.isArray(value) ? value : []
}

function accountKey(account = {}) {
  return normalizeText(account?.id)
}

function accountName(account = {}) {
  return formatAdminIdentity(account) || '未命名账号'
}

function accessForRole(accessByRoleKey = {}, roleKey = '') {
  if (accessByRoleKey instanceof Map) {
    return accessByRoleKey.get(roleKey) || null
  }
  return accessByRoleKey?.[roleKey] || null
}

function getCurrentNavigationSections(navigationSections) {
  if (Array.isArray(navigationSections)) {
    return navigationSections
  }
  return [...getNavigationSections(), ...getAuthenticatedNavigationSections()]
}

function getEffectivePathSet(accesses = []) {
  const paths = new Set()
  normalizeList(accesses).forEach((access) => {
    normalizeList(access?.pages)
      .filter((page) => page?.effective === true)
      .map((page) => normalizeText(page?.path))
      .filter(Boolean)
      .forEach((path) => paths.add(path))
  })
  return paths
}

function filterNavigationSections(
  navigationSections = [],
  effectivePaths = new Set()
) {
  return normalizeList(navigationSections)
    .map((section) => ({
      ...section,
      items: normalizeList(section?.items).filter(
        (item) =>
          item?.access === 'authenticated' || effectivePaths.has(item?.path)
      ),
    }))
    .filter((section) => section.items.length > 0)
}

function normalizeMenuItem(item = {}, order = 0) {
  return {
    key: normalizeText(item?.key) || normalizeText(item?.path),
    label: normalizeText(item?.label) || '未命名页面',
    path: normalizeText(item?.path),
    order,
  }
}

function normalizePlacement(placement = {}) {
  const dashboardItems = normalizeList(placement?.dashboardItems).map(
    (item, index) => normalizeMenuItem(item, index + 1)
  )
  const primaryItems = normalizeList(placement?.primaryItems).map(
    (item, index) => normalizeMenuItem(item, index + 1)
  )
  let secondaryOrder = 0
  const secondarySections = normalizeList(placement?.secondarySections).map(
    (section, sectionIndex) => ({
      key:
        normalizeText(section?.key) ||
        `menu-section-${String(sectionIndex + 1)}`,
      title: normalizeText(section?.title) || '其他功能',
      items: normalizeList(section?.items).map((item) => {
        secondaryOrder += 1
        return normalizeMenuItem(item, secondaryOrder)
      }),
    })
  )
  return {
    dashboardItems,
    primaryItems,
    secondarySections,
    secondaryItemCount: secondaryOrder,
    totalItemCount:
      dashboardItems.length + primaryItems.length + secondaryOrder,
  }
}

function unavailableModel({
  contextLabel = '当前选择',
  modeLabel = '待核对',
  message = '最终菜单结果尚未读取。',
} = {}) {
  return {
    state: PERMISSION_NAVIGATION_STATE.UNAVAILABLE,
    contextLabel,
    mode: '',
    modeLabel,
    message,
    notice: '',
    effectivePageCount: 0,
    dashboardItems: [],
    primaryItems: [],
    secondarySections: [],
    secondaryItemCount: 0,
    totalItemCount: 0,
  }
}

function readyModel({
  placement,
  contextLabel,
  mode,
  modeLabel,
  notice = '',
  effectivePageCount = 0,
  blocked = false,
}) {
  return {
    state: blocked
      ? PERMISSION_NAVIGATION_STATE.BLOCKED
      : PERMISSION_NAVIGATION_STATE.READY,
    contextLabel,
    mode,
    modeLabel,
    message: '',
    notice,
    effectivePageCount,
    ...normalizePlacement(placement),
  }
}

function buildRoleNavigationModel({
  targetKey,
  roles,
  accessByRoleKey,
  navigationSections,
}) {
  const role = normalizeList(roles).find(
    (item) => getPermissionCenterRoleKey(item) === normalizeText(targetKey)
  )
  if (!role) {
    return unavailableModel({ message: '请选择要查看的岗位。' })
  }

  const roleKey = getPermissionCenterRoleKey(role)
  const roleName = getPermissionCenterRoleName(role)
  const access = accessForRole(accessByRoleKey, roleKey)
  if (!access || access?.is_final !== true) {
    return unavailableModel({
      contextLabel: roleName,
      message: '该岗位的最终页面结果尚未完整读取，当前不生成可能失真的菜单。',
    })
  }

  const settings = normalizeRoleNavigationSettings(role)
  const effectivePaths = getEffectivePathSet([access])
  const placement = buildRoleGuidedNavigationPreview({
    navigationSections,
    effectiveAccess: access,
    roleKey,
    navigationMode: settings.mode,
    primaryMenuPaths: settings.primaryMenuPaths,
    secondaryMenuPaths: settings.secondaryMenuPaths,
  })
  const blocked = role?.disabled === true
  return readyModel({
    placement,
    contextLabel: roleName,
    mode: settings.mode,
    modeLabel:
      settings.mode === ROLE_NAVIGATION_MODES.CUSTOM
        ? '自定义布局'
        : '系统推荐',
    notice: blocked
      ? '岗位已停用；以下仅用于核对保存的菜单位置，当前不可实际使用。'
      : '',
    effectivePageCount: effectivePaths.size,
    blocked,
  })
}

function buildAccountNavigationModel({
  targetKey,
  accounts,
  roles,
  accessByRoleKey,
  navigationSections,
}) {
  const account = normalizeList(accounts).find(
    (item) => accountKey(item) === normalizeText(targetKey)
  )
  if (!account) {
    return unavailableModel({ message: '请选择要查看的员工账号。' })
  }

  const contextLabel = accountName(account)
  if (account?.is_super_admin === true) {
    return unavailableModel({
      contextLabel,
      modeLabel: '系统保留账号',
      message:
        '超级管理员菜单不由岗位布局生成；本页没有该账号的独立有效会话，不推导可能失真的完整菜单。',
    })
  }

  const roleKeys = getPermissionRelationshipRoleKeys({
    viewMode: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
    targetKey,
    accounts,
  })
  if (roleKeys.length === 0) {
    return unavailableModel({
      contextLabel,
      modeLabel: '未分配岗位',
      message: '该账号尚未分配岗位，没有可汇聚的岗位菜单。',
    })
  }

  const roleByKey = new Map(
    normalizeList(roles)
      .filter((role) => getPermissionCenterRoleKey(role))
      .map((role) => [getPermissionCenterRoleKey(role), role])
  )
  const selectedRoles = roleKeys.map((roleKey) => roleByKey.get(roleKey))
  const missingRoleKeys = roleKeys.filter((_, index) => !selectedRoles[index])
  if (missingRoleKeys.length > 0) {
    return unavailableModel({
      contextLabel,
      modeLabel: '岗位读取不完整',
      message: '该账号的岗位资料未完整读取，当前不生成菜单。',
    })
  }

  const accesses = roleKeys.map((roleKey) =>
    accessForRole(accessByRoleKey, roleKey)
  )
  const incompleteRoleNames = selectedRoles
    .filter((_, index) => accesses[index]?.is_final !== true)
    .map(getPermissionCenterRoleName)
  if (incompleteRoleNames.length > 0) {
    return unavailableModel({
      contextLabel,
      modeLabel: '最终结果不完整',
      message: `${incompleteRoleNames.join('、')}的最终页面结果尚未完整读取，当前不生成部分菜单。`,
    })
  }

  const effectivePaths = getEffectivePathSet(accesses)
  const visibleSections = filterNavigationSections(
    navigationSections,
    effectivePaths
  )
  const placement = buildRoleGuidedNavigation({
    visibleSections,
    adminProfile: {
      is_super_admin: false,
      roles: selectedRoles,
      effective_session: { roles: roleKeys },
    },
  })
  const accountStatus = getAdminAccountStatus(account)
  const blocked = accountStatus !== ADMIN_ACCOUNT_STATUS.ACTIVE
  const singleRoleSettings =
    selectedRoles.length === 1
      ? normalizeRoleNavigationSettings(selectedRoles[0])
      : null
  return readyModel({
    placement,
    contextLabel,
    mode: singleRoleSettings?.mode || 'merged',
    modeLabel:
      selectedRoles.length > 1
        ? `多岗位合并（${selectedRoles.length}）`
        : singleRoleSettings?.mode === ROLE_NAVIGATION_MODES.CUSTOM
          ? '自定义布局'
          : '系统推荐',
    notice: blocked
      ? `账号当前${ACCOUNT_STATUS_LABELS[accountStatus] || '不可用'}；以下仅用于核对岗位菜单投影，当前不能登录使用。`
      : '',
    effectivePageCount: effectivePaths.size,
    blocked,
  })
}

export function buildPermissionRelationshipNavigationModel({
  viewMode = PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
  targetKey = '',
  accounts = [],
  roles = [],
  accessByRoleKey = {},
  navigationSections = null,
} = {}) {
  const currentNavigationSections =
    getCurrentNavigationSections(navigationSections)
  if (viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT) {
    return buildAccountNavigationModel({
      targetKey,
      accounts,
      roles,
      accessByRoleKey,
      navigationSections: currentNavigationSections,
    })
  }
  return buildRoleNavigationModel({
    targetKey,
    roles,
    accessByRoleKey,
    navigationSections: currentNavigationSections,
  })
}
