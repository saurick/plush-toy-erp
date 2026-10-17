import {
  businessModuleDefinitions,
  businessNavigationSections,
} from '../config/businessModules.mjs'
import { canReadProductionExceptionDecisions, canReadProductionProcess } from './productionRecordViews.mjs'

const productionTabs = [
  { key: 'production-orders', label: '生产订单', path: '/erp/production/orders' },
  { key: 'production-execution', label: '生产执行', path: '/erp/production/progress', search: '?display=process' },
  { key: 'production-progress', label: '生产记录', path: '/erp/production/progress' },
  { key: 'production-exceptions', label: '异常处理', path: '/erp/production/exceptions' },
]

function moduleRouteKey(pathname, search = '') {
  return pathname === '/erp/production/progress' && new URLSearchParams(search).get('display') === 'process'
    ? `${pathname}?display=process`
    : pathname
}

const groups = businessNavigationSections.map((section) => ({
  key: section.key,
  label: section.title,
  tabs: section.items
    .filter((item) => item.sidebarVisible !== false && !item.sidebarParentPath)
    .map((item) => ({
      key: item.key,
      label: item.tabLabel || item.label,
      path: item.path,
    })),
}))

const sidebarAreas = [
  { key: 'work', title: '工作中心' },
  { key: 'business', title: '业务模块' },
  { key: 'tools', title: '工具与查询' },
  { key: 'system', title: '系统与帮助' },
]

const groupByPath = new Map()
for (const group of groups) {
  for (const tab of group.tabs) {
    groupByPath.set(tab.path, { group, tab })
    for (const item of businessModuleDefinitions) {
      if (item.sidebarParentPath === tab.path) {
        groupByPath.set(item.path, { group, tab })
      }
    }
  }
}

export function getBusinessModuleGroup(pathname) {
  return groupByPath.get(pathname)?.group || null
}

export function getBusinessModuleSidebarKey(pathname) {
  const group = getBusinessModuleGroup(pathname)
  return group ? `module:${group.key}` : pathname
}

// Project only already-authorized entries. The original paths remain the
// permission and routing contract, including role-specific default entries.
export function projectBusinessModuleSections(
  sections,
  { seen = new Set(), preserveEntryOrder = false } = {}
) {
  const visible = sections.flatMap((section) => section.items)
  return sections
    .map((section) => ({
      ...section,
      items: section.items.flatMap((item) => {
        const group = getBusinessModuleGroup(item.path)
        if (!group) return [item]
        if (seen.has(group.key)) return []
        seen.add(group.key)
        const defaultEntry = preserveEntryOrder
          ? item
          : group.tabs.flatMap((tab) => {
              const entry =
                visible.find((candidate) => candidate.path === tab.path) ||
                visible.find(
                  (candidate) => candidate.sidebarParentPath === tab.path
                )
              return entry ? [entry] : []
            })[0] || item
        return [
          {
            ...defaultEntry,
            label: group.label,
            sidebarKey: getBusinessModuleSidebarKey(item.path),
          },
        ]
      }),
    }))
    .filter((section) => section.items.length > 0)
}

export function groupSidebarNavigationSections(
  sections,
  { pageCatalog = false } = {}
) {
  const items = sections.flatMap((section) => section.items)
  const definitions = pageCatalog
    ? [
        sidebarAreas[0],
        ...groups.map((group) => ({ key: group.key, title: group.label })),
        ...sidebarAreas.slice(2),
      ]
    : sidebarAreas
  return definitions
    .map((section) => ({
      ...section,
      items: items.filter((item) => {
        const group = getBusinessModuleGroup(item.path)
        const key = group
          ? pageCatalog
            ? group.key
            : 'business'
          : item.sidebarArea || 'tools'
        return key === section.key
      }),
    }))
    .filter((section) => section.items.length > 0)
}

export function projectRoleGuidedModuleNavigation(navigation) {
  const seen = new Set()
  const primaryItems =
    projectBusinessModuleSections([{ items: navigation.primaryItems }], {
      seen,
      preserveEntryOrder: true,
    })[0]?.items || []
  const secondarySections = groupSidebarNavigationSections(
    projectBusinessModuleSections(
      [
        {
          items:
            navigation.secondaryItems ||
            navigation.secondarySections.flatMap((section) => section.items),
        },
      ],
      { seen, preserveEntryOrder: true }
    )
  )
  const secondaryItems = secondarySections.flatMap((section) => section.items)
  return {
    ...navigation,
    primaryItems,
    secondarySections,
    secondaryItems,
    secondaryItemCount: secondaryItems.length,
  }
}

export function getBusinessModuleTabs(pathname, sections, { search = '', adminProfile } = {}) {
  const match = groupByPath.get(pathname)
  if (!match || match.group.tabs.length === 1) return null
  const visible = sections.flatMap((section) => section.items)
  if (match.group.key === 'production') {
    const tabs = productionTabs.filter((tab) => {
      if (!visible.some((item) => item.path === tab.path)) return false
      if (tab.key === 'production-execution') return canReadProductionProcess(adminProfile)
      if (tab.key === 'production-exceptions') return canReadProductionExceptionDecisions(adminProfile)
      return true
    })
    let activeKey = pathname === '/erp/production/scheduling'
      ? 'production-orders'
      : productionTabs.find((tab) => moduleRouteKey(tab.path, tab.search) === moduleRouteKey(pathname, search))?.key
    if (activeKey === 'production-execution' && !tabs.some((tab) => tab.key === activeKey)) activeKey = 'production-progress'
    return { group: match.group, activeKey, tabs }
  }
  const tabs = match.group.tabs.flatMap((tab) => {
    const entry =
      visible.find((item) => item.path === tab.path) ||
      visible.find((item) => item.sidebarParentPath === tab.path)
    return entry ? [{ ...tab, path: entry.path }] : []
  })
  return { group: match.group, activeKey: match.tab.key, tabs }
}

export function rememberBusinessModuleLocation(cache, location) {
  const group = getBusinessModuleGroup(location.pathname)
  if (!group) return
  const route = {
    pathname: location.pathname,
    search: location.search || '',
    hash: location.hash || '',
  }
  cache.set(`module-route:${location.pathname}`, route)
  cache.set(`module-view:${moduleRouteKey(location.pathname, location.search)}`, route)
  cache.set(`module-last:${group.key}`, route)
}

export function restoreBusinessModuleTabPath(target, cache) {
  const { path: pathname, search = '' } = typeof target === 'string' ? { path: target } : target
  const route = typeof target === 'string'
    ? cache.get(`module-route:${pathname}`)
    : cache.get(`module-view:${moduleRouteKey(pathname, search)}`)
  return route ? `${pathname}${route.search}${route.hash}` : `${pathname}${search}`
}

export function resolveBusinessModuleMenuTarget(
  item,
  location,
  cache,
  visiblePaths
) {
  const group = getBusinessModuleGroup(item.path)
  const currentPath = `${location.pathname}${location.search || ''}${location.hash || ''}`
  if (!group) return item.path === location.pathname ? currentPath : item.path
  if (getBusinessModuleGroup(location.pathname)?.key === group.key) {
    return currentPath
  }
  const last = cache.get(`module-last:${group.key}`)
  if (
    last &&
    visiblePaths.includes(last.pathname) &&
    getBusinessModuleGroup(last.pathname)?.key === group.key
  ) {
    return `${last.pathname}${last.search}${last.hash}`
  }
  return item.path
}
