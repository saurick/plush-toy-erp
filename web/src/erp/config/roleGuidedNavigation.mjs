import { getRoleHelpGuidesForProfile } from './roleHelpContent.mjs'

const DEFAULT_PRIMARY_LIMIT = 3
const HELP_CENTER_PATH = '/erp/help-center'
const DASHBOARD_PATHS = Object.freeze([
  '/erp/dashboard',
  '/erp/task-board',
  '/erp/business-dashboard',
])
const DASHBOARD_PATH_SET = new Set(DASHBOARD_PATHS)

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

export function buildRoleGuidedNavigation({
  visibleSections = [],
  adminProfile = {},
  primaryLimit = DEFAULT_PRIMARY_LIMIT,
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

  const selectedPaths = []
  const addPath = (path) => {
    if (
      !path ||
      selectedPaths.length >= primaryLimit ||
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

  const guides = getRoleHelpGuidesForProfile(adminProfile)
  const priorityQueues = guides.map((guide) =>
    (Array.isArray(guide.priorities) ? guide.priorities : [])
      .map((priority) => priority.path)
      .filter(Boolean)
  )
  const priorityIndexes = priorityQueues.map(() => 0)
  let addedInRound = true
  while (selectedPaths.length < primaryLimit && addedInRound) {
    addedInRound = false
    for (
      let queueIndex = 0;
      queueIndex < priorityQueues.length && selectedPaths.length < primaryLimit;
      queueIndex += 1
    ) {
      const queue = priorityQueues[queueIndex]
      while (
        selectedPaths.length < primaryLimit &&
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

  if (selectedPaths.length < primaryLimit) {
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
  primaryLimit = DEFAULT_PRIMARY_LIMIT,
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
      roles: normalizedRoleKey ? [{ role_key: normalizedRoleKey }] : [],
      effective_session: {
        roles: normalizedRoleKey ? [normalizedRoleKey] : [],
      },
    },
    primaryLimit,
  })
}
