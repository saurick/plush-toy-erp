import {
  getRoleHelpGuide,
  getRoleHelpGuidesForProfile,
} from './roleHelpContent.mjs'

export const DEFAULT_ROLE_PRIMARY_LIMIT = 3
export const MAX_ROLE_PRIMARY_LIMIT = 5
export const ROLE_NAVIGATION_MODES = Object.freeze({
  RECOMMENDED: 'recommended',
  CUSTOM: 'custom',
})
const HELP_CENTER_PATH = '/erp/help-center'
const DASHBOARD_PATHS = Object.freeze([
  '/erp/dashboard',
  '/erp/task-board',
  '/erp/business-dashboard',
])
const DASHBOARD_PATH_SET = new Set(DASHBOARD_PATHS)
const RESERVED_PATH_SET = new Set([...DASHBOARD_PATHS, HELP_CENTER_PATH])
const SECONDARY_GROUP_DEFINITIONS = Object.freeze([
  {
    key: 'records',
    title: '资料与单据',
    sectionKeys: ['master', 'sales', 'engineering', 'purchase', 'outsourcing'],
    sectionTitles: ['基础资料', '销售管理', '产品工程', '采购管理', '委外管理'],
  },
  {
    key: 'manufacturing',
    title: '生产、品质与库存',
    sectionKeys: ['production', 'quality', 'warehouse'],
    sectionTitles: ['生产管理', '质检管理', '库存管理'],
  },
  {
    key: 'shipment-finance',
    title: '出货与财务',
    sectionKeys: ['shipment', 'finance'],
    sectionTitles: ['出货管理', '财务管理'],
  },
  {
    key: 'tools-help',
    title: '工具与帮助',
    sectionKeys: ['tools', 'system', 'help'],
    sectionTitles: ['运营工具', '系统管理', '使用帮助'],
  },
])

function normalizeSectionIdentity(value = '') {
  return String(value || '').trim()
}

function getItemSectionIdentity(item = {}) {
  return {
    key: normalizeSectionIdentity(
      item?.sectionKey || item?.navigationSectionKey
    ),
    title: normalizeSectionIdentity(
      item?.sectionTitle || item?.navigationSectionTitle
    ),
  }
}

function matchesSecondaryGroup(definition, item = {}) {
  if (item?.path === HELP_CENTER_PATH) {
    return definition.key === 'tools-help'
  }
  const section = getItemSectionIdentity(item)
  return (
    definition.sectionKeys.includes(section.key) ||
    definition.sectionTitles.includes(section.title)
  )
}

function resolveSecondaryGroupTitle(definition, items = []) {
  const matchesSection = (sectionKey, sectionTitle) =>
    items.some((item) => {
      const section = getItemSectionIdentity(item)
      return section.key === sectionKey || section.title === sectionTitle
    })

  if (definition.key === 'manufacturing') {
    const hasProduction = matchesSection('production', '生产管理')
    const hasQuality = matchesSection('quality', '质检管理')
    const hasWarehouse = matchesSection('warehouse', '库存管理')
    if (hasProduction && hasQuality && hasWarehouse) {
      return '生产、品质与库存'
    }
    if (hasProduction && hasQuality) {
      return '生产与品质'
    }
    if (hasProduction && hasWarehouse) {
      return '生产与库存'
    }
    if (hasQuality && hasWarehouse) {
      return '品质与库存'
    }
    if (hasProduction) {
      return '生产管理'
    }
    if (hasQuality) {
      return '品质管理'
    }
    if (hasWarehouse) {
      return '库存管理'
    }
  }

  if (definition.key === 'shipment-finance') {
    const hasShipment = matchesSection('shipment', '出货管理')
    const hasFinance = matchesSection('finance', '财务管理')
    if (hasShipment && hasFinance) {
      return '出货与财务'
    }
    if (hasShipment) {
      return '出货处理'
    }
    if (hasFinance) {
      return '财务业务'
    }
  }

  return definition.title
}

export function buildRoleGuidedSecondarySections(items = []) {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : []
  const groups = new Map()
  const fallbackGroupKeys = []

  normalizedItems.forEach((item) => {
    const definition = SECONDARY_GROUP_DEFINITIONS.find((candidate) =>
      matchesSecondaryGroup(candidate, item)
    )
    const section = getItemSectionIdentity(item)
    const key =
      definition?.key || `section:${section.key || section.title || 'other'}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        definition,
        fallbackTitle: section.title || '其他功能',
        items: [],
      })
      if (!definition) {
        fallbackGroupKeys.push(key)
      }
    }
    groups.get(key).items.push(item)
  })

  return [
    ...SECONDARY_GROUP_DEFINITIONS.filter(
      (definition) => definition.key !== 'tools-help'
    ).map((definition) => definition.key),
    ...fallbackGroupKeys,
    'tools-help',
  ]
    .map((key) => groups.get(key))
    .filter(Boolean)
    .map((group) => ({
      key: group.key,
      title: group.definition
        ? resolveSecondaryGroupTitle(group.definition, group.items)
        : group.fallbackTitle,
      items: group.items,
    }))
}

export function isRoleNavigationCustomizablePath(path = '') {
  const normalized = String(path || '').trim()
  return Boolean(normalized) && !RESERVED_PATH_SET.has(normalized)
}

function normalizeSections(sections = []) {
  if (!Array.isArray(sections)) {
    return []
  }
  return sections
    .map((section) => {
      const navigationSectionKey = normalizeSectionIdentity(section?.key)
      const navigationSectionTitle = normalizeSectionIdentity(section?.title)
      return {
        ...section,
        items: Array.isArray(section?.items)
          ? section.items.filter(Boolean).map((item) => ({
              ...item,
              navigationSectionKey:
                normalizeSectionIdentity(item?.navigationSectionKey) ||
                navigationSectionKey,
              navigationSectionTitle:
                normalizeSectionIdentity(item?.navigationSectionTitle) ||
                navigationSectionTitle,
            }))
          : [],
      }
    })
    .filter((section) => section.items.length > 0)
}

function normalizeRoleKey(role = {}) {
  return String(role?.role_key || role?.key || role || '').trim()
}

function normalizeMenuPaths(paths = []) {
  const unique = []
  if (!Array.isArray(paths)) {
    return unique
  }
  paths.forEach((path) => {
    const normalized = String(path || '').trim()
    if (
      normalized &&
      isRoleNavigationCustomizablePath(normalized) &&
      !unique.includes(normalized)
    ) {
      unique.push(normalized)
    }
  })
  return unique
}

export function normalizeRoleNavigationSettings(role = {}) {
  const mode =
    role?.navigation_mode === ROLE_NAVIGATION_MODES.CUSTOM
      ? ROLE_NAVIGATION_MODES.CUSTOM
      : ROLE_NAVIGATION_MODES.RECOMMENDED
  if (mode !== ROLE_NAVIGATION_MODES.CUSTOM) {
    return {
      mode: ROLE_NAVIGATION_MODES.RECOMMENDED,
      primaryMenuPaths: [],
      secondaryMenuPaths: [],
    }
  }
  const rawPrimaryPaths = Array.isArray(role?.primary_menu_paths)
    ? role.primary_menu_paths
        .map((path) => String(path || '').trim())
        .filter(Boolean)
    : []
  const rawSecondaryPaths = Array.isArray(role?.secondary_menu_paths)
    ? role.secondary_menu_paths
        .map((path) => String(path || '').trim())
        .filter(Boolean)
    : []
  const primaryMenuPaths = normalizeMenuPaths(rawPrimaryPaths)
  const secondaryMenuPaths = normalizeMenuPaths(rawSecondaryPaths)
  const primaryPathSet = new Set(primaryMenuPaths)
  const invalid =
    primaryMenuPaths.length === 0 ||
    primaryMenuPaths.length > MAX_ROLE_PRIMARY_LIMIT ||
    primaryMenuPaths.length !== rawPrimaryPaths.length ||
    secondaryMenuPaths.length !== rawSecondaryPaths.length ||
    secondaryMenuPaths.some((path) => primaryPathSet.has(path))
  if (invalid) {
    return {
      mode: ROLE_NAVIGATION_MODES.RECOMMENDED,
      primaryMenuPaths: [],
      secondaryMenuPaths: [],
    }
  }
  return { mode, primaryMenuPaths, secondaryMenuPaths }
}

function buildRoleObjectMap(adminProfile = {}) {
  const roleMap = new Map()
  const roles = Array.isArray(adminProfile?.roles) ? adminProfile.roles : []
  roles.forEach((role) => {
    const roleKey = normalizeRoleKey(role)
    if (roleKey && role && typeof role === 'object') {
      roleMap.set(roleKey, role)
    }
  })
  return roleMap
}

function getOrderedRoleKeys(adminProfile = {}) {
  const effectiveRoleKeys = Array.isArray(
    adminProfile?.effective_session?.roles
  )
    ? adminProfile.effective_session.roles
    : []
  const roleValues =
    effectiveRoleKeys.length > 0
      ? effectiveRoleKeys
      : Array.isArray(adminProfile?.roles)
        ? adminProfile.roles
        : []
  return [...new Set(roleValues.map(normalizeRoleKey).filter(Boolean))]
}

function consumeQueuesRoundRobin(queues, addPath) {
  const normalizedQueues = Array.isArray(queues) ? queues : []
  const indexes = normalizedQueues.map(() => 0)
  let addedInRound = true
  while (addedInRound) {
    addedInRound = false
    for (
      let queueIndex = 0;
      queueIndex < normalizedQueues.length;
      queueIndex += 1
    ) {
      const queue = normalizedQueues[queueIndex]
      while (indexes[queueIndex] < queue.length) {
        const path = queue[indexes[queueIndex]]
        indexes[queueIndex] += 1
        if (addPath(path)) {
          addedInRound = true
          break
        }
      }
    }
  }
}

export function reconcileRoleNavigationPaths({
  effectivePaths = [],
  primaryMenuPaths = [],
  secondaryMenuPaths = [],
} = {}) {
  const orderedEffectivePaths = normalizeMenuPaths(effectivePaths)
  const effectivePathSet = new Set(orderedEffectivePaths)
  const primary = normalizeMenuPaths(primaryMenuPaths)
    .filter((path) => effectivePathSet.has(path))
    .slice(0, MAX_ROLE_PRIMARY_LIMIT)
  const primaryPathSet = new Set(primary)
  const secondary = normalizeMenuPaths(secondaryMenuPaths).filter(
    (path) => effectivePathSet.has(path) && !primaryPathSet.has(path)
  )
  const secondaryPathSet = new Set(secondary)
  orderedEffectivePaths.forEach((path) => {
    if (!primaryPathSet.has(path) && !secondaryPathSet.has(path)) {
      secondary.push(path)
      secondaryPathSet.add(path)
    }
  })
  return {
    primaryMenuPaths: primary,
    secondaryMenuPaths: secondary,
  }
}

export function buildRoleGuidedNavigation({
  visibleSections = [],
  adminProfile = {},
  primaryLimit,
} = {}) {
  const sections = normalizeSections(visibleSections)
  const itemByPath = new Map()
  sections.forEach((section) => {
    section.items.forEach((item) => {
      if (item?.path && !itemByPath.has(item.path)) {
        itemByPath.set(item.path, item)
      }
    })
  })

  const roleMap = buildRoleObjectMap(adminProfile)
  const orderedRoleKeys = getOrderedRoleKeys(adminProfile)
  const guides =
    orderedRoleKeys.length > 0
      ? orderedRoleKeys.map(
          (roleKey) =>
            getRoleHelpGuide(roleKey) || {
              key: roleKey,
              priorities: [],
              recommendedPrimaryLimit: DEFAULT_ROLE_PRIMARY_LIMIT,
            }
        )
      : getRoleHelpGuidesForProfile(adminProfile)
  const queueSettings = guides.map((guide) => {
    const settings = normalizeRoleNavigationSettings(roleMap.get(guide.key))
    const recommendedPaths = (
      Array.isArray(guide.priorities) ? guide.priorities : []
    )
      .map((priority) => priority.path)
      .filter(Boolean)
    return {
      guide,
      settings,
      paths:
        settings.mode === ROLE_NAVIGATION_MODES.CUSTOM
          ? settings.primaryMenuPaths
          : recommendedPaths,
      secondaryPaths:
        settings.mode === ROLE_NAVIGATION_MODES.CUSTOM
          ? settings.secondaryMenuPaths
          : [],
      recommendedPaths,
    }
  })
  const explicitLimit = Number(primaryLimit)
  const hasExplicitLimit = Number.isInteger(explicitLimit) && explicitLimit > 0
  const hasCustomQueue = queueSettings.some(
    ({ settings }) => settings.mode === ROLE_NAVIGATION_MODES.CUSTOM
  )
  const recommendedLimit = Math.max(
    DEFAULT_ROLE_PRIMARY_LIMIT,
    ...queueSettings.map(({ guide }) =>
      Number.isInteger(guide?.recommendedPrimaryLimit)
        ? guide.recommendedPrimaryLimit
        : DEFAULT_ROLE_PRIMARY_LIMIT
    )
  )
  const resolvedPrimaryLimit = Math.min(
    MAX_ROLE_PRIMARY_LIMIT,
    hasExplicitLimit
      ? explicitLimit
      : hasCustomQueue
        ? MAX_ROLE_PRIMARY_LIMIT
        : recommendedLimit
  )
  const selectedPaths = []
  const addPath = (path) => {
    if (
      !path ||
      selectedPaths.length >= resolvedPrimaryLimit ||
      selectedPaths.includes(path) ||
      DASHBOARD_PATH_SET.has(path) ||
      path === HELP_CENTER_PATH ||
      !itemByPath.has(path)
    ) {
      return false
    }
    selectedPaths.push(path)
    return true
  }

  consumeQueuesRoundRobin(
    queueSettings.map(({ paths }) => paths),
    addPath
  )

  const hasRecommendedQueue = queueSettings.some(
    ({ settings }) => settings.mode === ROLE_NAVIGATION_MODES.RECOMMENDED
  )
  if (hasRecommendedQueue && selectedPaths.length < resolvedPrimaryLimit) {
    sections.forEach((section) => {
      section.items.forEach((item) => {
        addPath(item.path)
      })
    })
  }

  const dashboardItems = DASHBOARD_PATHS.map((path) =>
    itemByPath.get(path)
  ).filter(Boolean)
  const primaryItems = selectedPaths.map((path) => itemByPath.get(path))
  const primaryPathSet = new Set(primaryItems.map((item) => item.path))
  const secondaryPaths = []
  const addSecondaryPath = (path) => {
    if (
      !path ||
      primaryPathSet.has(path) ||
      secondaryPaths.includes(path) ||
      DASHBOARD_PATH_SET.has(path) ||
      path === HELP_CENTER_PATH ||
      !itemByPath.has(path)
    ) {
      return false
    }
    secondaryPaths.push(path)
    return true
  }
  consumeQueuesRoundRobin(
    queueSettings.map(({ secondaryPaths: paths }) => paths),
    addSecondaryPath
  )
  sections.forEach((section) => {
    section.items.forEach((item) => addSecondaryPath(item.path))
  })
  if (itemByPath.has(HELP_CENTER_PATH)) {
    secondaryPaths.push(HELP_CENTER_PATH)
  }
  const rawSecondaryItems = secondaryPaths.map((path) => itemByPath.get(path))
  const secondarySections = buildRoleGuidedSecondarySections(rawSecondaryItems)
  const secondaryItems = rawSecondaryItems

  return {
    dashboardItems,
    primaryItems,
    secondaryItems,
    secondarySections,
    secondaryItemCount: secondaryItems.length,
  }
}

export function buildRoleGuidedNavigationPreview({
  navigationSections = [],
  effectiveAccess = null,
  roleKey = '',
  navigationMode = ROLE_NAVIGATION_MODES.RECOMMENDED,
  primaryMenuPaths = [],
  secondaryMenuPaths = [],
  primaryLimit,
} = {}) {
  const effectivePathSet = new Set(
    (Array.isArray(effectiveAccess?.pages) ? effectiveAccess.pages : [])
      .filter((page) => page?.effective === true)
      .map((page) => String(page?.path || '').trim())
      .filter(Boolean)
  )
  const visibleSections = normalizeSections(navigationSections)
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item?.access === 'authenticated' || effectivePathSet.has(item?.path)
      ),
    }))
    .filter((section) => section.items.length > 0)
  const normalizedRoleKey = String(roleKey || '').trim()

  return buildRoleGuidedNavigation({
    visibleSections,
    adminProfile: {
      roles: normalizedRoleKey
        ? [
            {
              role_key: normalizedRoleKey,
              navigation_mode: navigationMode,
              primary_menu_paths: primaryMenuPaths,
              secondary_menu_paths: secondaryMenuPaths,
            },
          ]
        : [],
      effective_session: {
        roles: normalizedRoleKey ? [normalizedRoleKey] : [],
      },
    },
    primaryLimit,
  })
}
