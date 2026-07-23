import { getRoleHelpGuidesForProfile } from './roleHelpContent.mjs'

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

export function isRoleNavigationCustomizablePath(path = '') {
  const normalized = String(path || '').trim()
  return Boolean(normalized) && !RESERVED_PATH_SET.has(normalized)
}

function normalizeSections(sections = []) {
  if (!Array.isArray(sections)) {
    return []
  }
  return sections
    .map((section) => ({
      ...section,
      items: Array.isArray(section?.items) ? section.items.filter(Boolean) : [],
    }))
    .filter((section) => section.items.length > 0)
}

function normalizeRoleKey(role = {}) {
  return String(role?.role_key || role?.key || role || '').trim()
}

function normalizePrimaryMenuPaths(paths = []) {
  const unique = []
  if (!Array.isArray(paths)) {
    return unique
  }
  paths.forEach((path) => {
    const normalized = String(path || '').trim()
    if (
      normalized &&
      isRoleNavigationCustomizablePath(normalized) &&
      !unique.includes(normalized) &&
      unique.length < MAX_ROLE_PRIMARY_LIMIT
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
  const primaryMenuPaths = normalizePrimaryMenuPaths(role?.primary_menu_paths)
  if (mode !== ROLE_NAVIGATION_MODES.CUSTOM || primaryMenuPaths.length === 0) {
    return {
      mode: ROLE_NAVIGATION_MODES.RECOMMENDED,
      primaryMenuPaths: [],
    }
  }
  return { mode, primaryMenuPaths }
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

  const guides = getRoleHelpGuidesForProfile(adminProfile)
  const roleMap = buildRoleObjectMap(adminProfile)
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

  const priorityQueues = queueSettings.map(({ paths }) => paths)
  const priorityIndexes = priorityQueues.map(() => 0)
  let addedInRound = true
  while (selectedPaths.length < resolvedPrimaryLimit && addedInRound) {
    addedInRound = false
    for (
      let queueIndex = 0;
      queueIndex < priorityQueues.length &&
      selectedPaths.length < resolvedPrimaryLimit;
      queueIndex += 1
    ) {
      const queue = priorityQueues[queueIndex]
      while (
        selectedPaths.length < resolvedPrimaryLimit &&
        priorityIndexes[queueIndex] < queue.length
      ) {
        const path = queue[priorityIndexes[queueIndex]]
        priorityIndexes[queueIndex] += 1
        if (addPath(path)) {
          addedInRound = true
          break
        }
      }
    }
  }

  const allCustomPathsUnavailable =
    hasCustomQueue &&
    selectedPaths.length === 0 &&
    queueSettings.every(
      ({ settings }) => settings.mode === ROLE_NAVIGATION_MODES.CUSTOM
    )
  if (allCustomPathsUnavailable) {
    queueSettings.forEach(({ recommendedPaths }) => {
      recommendedPaths.forEach(addPath)
    })
  }

  const singleCustomRole =
    queueSettings.length === 1 &&
    queueSettings[0]?.settings.mode === ROLE_NAVIGATION_MODES.CUSTOM
  if (!singleCustomRole && selectedPaths.length < resolvedPrimaryLimit) {
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

  const primaryPathSet = new Set(
    [...dashboardItems, ...primaryItems].map((item) => item.path)
  )
  const secondarySections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !primaryPathSet.has(item.path)),
    }))
    .filter((section) => section.items.length > 0)

  return {
    dashboardItems,
    primaryItems,
    secondarySections,
    secondaryItemCount: secondarySections.reduce(
      (total, section) => total + section.items.length,
      0
    ),
  }
}

export function buildRoleGuidedNavigationPreview({
  navigationSections = [],
  effectiveAccess = null,
  roleKey = '',
  navigationMode = ROLE_NAVIGATION_MODES.RECOMMENDED,
  primaryMenuPaths = [],
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
