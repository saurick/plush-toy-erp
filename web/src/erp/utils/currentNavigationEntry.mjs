export const DEFAULT_DESKTOP_ENTRY = Object.freeze({
  label: '工作台',
  path: '/erp/dashboard',
  description: '聚合今日待办、阻塞、业务摘要、打印入口和常用业务模块。',
})

function flattenNavigationItems(navigationSections = []) {
  return (Array.isArray(navigationSections) ? navigationSections : []).flatMap(
    (section) => (Array.isArray(section?.items) ? section.items : [])
  )
}

export function resolveCurrentNavigationEntry({
  navigationSections = [],
  locationPath = '',
  fallbackEntry = DEFAULT_DESKTOP_ENTRY,
} = {}) {
  const normalizedPath =
    typeof locationPath === 'string' ? locationPath.trim() : ''
  const items = flattenNavigationItems(navigationSections)
  const exactMatch = items.find((item) => item.path === normalizedPath)
  if (exactMatch) {
    return {
      entry: exactMatch,
      matched: true,
      matchType: 'exact',
      pageKey: exactMatch.key || '',
      menuPath: exactMatch.path || '',
    }
  }

  const prefixMatch = items.find((item) =>
    normalizedPath.startsWith(`${item.path}/`)
  )
  if (prefixMatch) {
    return {
      entry: prefixMatch,
      matched: true,
      matchType: 'prefix',
      pageKey: prefixMatch.key || '',
      menuPath: prefixMatch.path || '',
    }
  }

  return {
    entry:
      items.find((item) => item.path === fallbackEntry.path) || fallbackEntry,
    matched: false,
    matchType: 'fallback',
    pageKey: '',
    menuPath: '',
  }
}
