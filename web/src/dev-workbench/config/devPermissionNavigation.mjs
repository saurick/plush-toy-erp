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
  getPermissionCenterRoleKey,
  getPermissionCenterRoleName,
} from '../../erp/utils/permissionCenterAccess.mjs'
import {
  PERMISSION_RELATIONSHIP_VIEW_MODE,
  getPermissionRelationshipContext,
} from './devPermissionRelationshipGraph.mjs'
import { formatAdminIdentity } from '../../erp/utils/adminIdentity.mjs'
import { projectRoleGuidedModuleNavigation } from '../../erp/utils/businessModuleGroups.mjs'

export const PERMISSION_NAVIGATION_STATE = Object.freeze({
  READY: 'ready',
  BLOCKED: 'blocked',
  UNAVAILABLE: 'unavailable',
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeList(value = []) {
  return Array.isArray(value) ? value : []
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
  projectionOnly = false,
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
    projectionOnly,
    ...normalizePlacement(placement),
  }
}

function buildRoleNavigationModel({ accessByRoleKey, navigationSections, context }) {
  const role = context.roles[0]
  if (!role) {
    return unavailableModel({ message: '请选择要查看的岗位。' })
  }

  const roleKey = getPermissionCenterRoleKey(role)
  const roleName = getPermissionCenterRoleName(role)
  const access = accessForRole(accessByRoleKey, roleKey)
  if (context.blocked) {
    return readyModel({
      placement: {},
      contextLabel: roleName,
      blocked: true,
      modeLabel: '岗位已停用',
      notice: '岗位已停用，当前没有可用菜单。',
    })
  }
  if (!context.ready) {
    return unavailableModel({
      contextLabel: roleName,
      message:
        context.issues.join('；') ||
        '该岗位的最终页面结果尚未完整读取，当前不生成可能失真的菜单。',
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
  return readyModel({
    placement,
    contextLabel: roleName,
    mode: settings.mode,
    modeLabel:
      settings.mode === ROLE_NAVIGATION_MODES.CUSTOM
        ? '自定义布局'
        : '系统推荐',
    effectivePageCount: effectivePaths.size,
    projectionOnly: context.projectionOnly,
  })
}

function buildAccountNavigationModel({ accessByRoleKey, navigationSections, context }) {
  const { account } = context
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

  if (context.blocked) {
    return readyModel({
      placement: {},
      contextLabel,
      blocked: true,
      modeLabel: '当前不可使用',
      notice: `${context.blockedReason}；岗位分配仍保留，当前没有可用菜单。`,
    })
  }
  if (context.issues.length > 0) {
    return unavailableModel({
      contextLabel,
      message: context.issues.join('；'),
    })
  }

  const selectedRoles = context.roles.filter((role) => role.disabled !== true)
  const roleKeys = selectedRoles.map(getPermissionCenterRoleKey)
  if (roleKeys.length === 0) {
    return unavailableModel({
      contextLabel,
      modeLabel: '未分配岗位',
      message: '该账号尚未分配岗位，没有可汇聚的岗位菜单。',
    })
  }

  const accesses = roleKeys.map((roleKey) =>
    accessForRole(accessByRoleKey, roleKey)
  )
  const effectivePaths = getEffectivePathSet(accesses)
  const visibleSections = filterNavigationSections(
    navigationSections,
    effectivePaths
  )
  const placement = projectRoleGuidedModuleNavigation(
    buildRoleGuidedNavigation({
      visibleSections,
      adminProfile: {
        is_super_admin: false,
        roles: selectedRoles,
        effective_session: { roles: roleKeys },
      },
    })
  )
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
    notice: context.projectionOnly
      ? '以下是各岗位菜单的合并参考；跨岗位组合后的实际菜单须以该账号登录会话为准。'
      : '',
    effectivePageCount: effectivePaths.size,
    projectionOnly: context.projectionOnly,
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
  const context = getPermissionRelationshipContext({
    viewMode,
    targetKey,
    accounts,
    roles,
    accessByRoleKey,
  })
  if (viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT) {
    return buildAccountNavigationModel({
      accessByRoleKey,
      navigationSections: currentNavigationSections,
      context,
    })
  }
  return buildRoleNavigationModel({
    accessByRoleKey,
    navigationSections: currentNavigationSections,
    context,
  })
}
