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
const HISTORY_RECORDS_PATH = '/erp/history'
const DASHBOARD_PATHS = Object.freeze([
  '/erp/dashboard',
  '/erp/task-board',
  '/erp/business-dashboard',
])
const DASHBOARD_PATH_SET = new Set(DASHBOARD_PATHS)
const RESERVED_PATH_SET = new Set([
  ...DASHBOARD_PATHS,
  HISTORY_RECORDS_PATH,
  HELP_CENTER_PATH,
])

function normalizeSectionIdentity(value = '') {
  return String(value || '').trim()
}

function normalizeSectionOrder(value) {
  const order = Number(value)
  return Number.isInteger(order) && order >= 0 ? order : Number.MAX_SAFE_INTEGER
}

function getItemSectionIdentity(item = {}) {
  return {
    key: normalizeSectionIdentity(
      item?.navigationSectionKey || item?.sectionKey
    ),
    title: normalizeSectionIdentity(
      item?.navigationSectionTitle || item?.sectionTitle
    ),
    order: normalizeSectionOrder(item?.navigationSectionOrder),
  }
}

export function buildRoleGuidedSecondarySections(items = []) {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : []
  const groups = new Map()

  normalizedItems.forEach((item, itemIndex) => {
    const section = getItemSectionIdentity(item)
    const identity = section.key || section.title || 'other'
    const key = `section:${identity}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: section.title || '其他功能',
        order: section.order,
        firstItemIndex: itemIndex,
        items: [],
      })
    }
    groups.get(key).items.push(item)
  })

  return [...groups.values()]
    .sort(
      (left, right) =>
        left.order - right.order || left.firstItemIndex - right.firstItemIndex
    )
    .map((group) => ({
      key: group.key,
      title: group.title,
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
    .map((section, sectionIndex) => {
      const navigationSectionKey = normalizeSectionIdentity(section?.key)
      const navigationSectionTitle = normalizeSectionIdentity(section?.title)
      return {
        ...section,
        items: Array.isArray(section?.items)
          ? section.items.filter(Boolean).map((item) => ({
              ...item,
              navigationSectionKey:
                navigationSectionKey ||
                normalizeSectionIdentity(item?.navigationSectionKey) ||
                normalizeSectionIdentity(item?.sectionKey),
              navigationSectionTitle:
                navigationSectionTitle ||
                normalizeSectionIdentity(item?.navigationSectionTitle) ||
                normalizeSectionIdentity(item?.sectionTitle),
              navigationSectionOrder: sectionIndex,
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
      RESERVED_PATH_SET.has(path) ||
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
      RESERVED_PATH_SET.has(path) ||
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
  for (const path of [HISTORY_RECORDS_PATH, HELP_CENTER_PATH]) {
    if (itemByPath.has(path)) secondaryPaths.push(path)
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
