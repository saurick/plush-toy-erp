import {
  getAuthenticatedNavigationSections,
  getNavigationSections,
} from '../config/seedData.mjs'
import { businessModuleDefinitions } from '../config/businessModules.mjs'
import {
  getBusinessModuleGroup,
  getBusinessModuleSidebarKey,
  groupSidebarNavigationSections,
} from './businessModuleGroups.mjs'

const navigationItems = [
  ...getNavigationSections(),
  ...getAuthenticatedNavigationSections(),
].flatMap((section) => section.items)
const pageEntries = [...businessModuleDefinitions, ...navigationItems]
const entryByPath = new Map(pageEntries.map((item) => [item.path, item]))
const entryByKey = new Map(pageEntries.map((item) => [item.key, item]))
const pageOrder = new Map(pageEntries.map((item, index) => [item.path, index]))

export function getPermissionPageEntry(page = {}) {
  const entry = entryByPath.get(page.path) || entryByKey.get(page.key)
  return {
    ...entry,
    ...page,
    label: entry?.label || page.label || '未登记页面',
  }
}

export function groupPermissionPages(pages = []) {
  const known = []
  const other = []
  for (const page of pages) {
    const entry = getPermissionPageEntry(page)
    ;(entryByPath.has(page.path) || entryByKey.has(page.key)
      ? known
      : other
    ).push(entry)
  }
  known.sort(
    (a, b) => (pageOrder.get(a.path) ?? 0) - (pageOrder.get(b.path) ?? 0)
  )
  return [
    ...groupSidebarNavigationSections([{ items: known }], {
      pageCatalog: true,
    }),
    ...(other.length
      ? [{ key: 'other', title: '其他页面', items: other }]
      : []),
  ]
}

const accessReasonLabels = {
  role_disabled: '岗位已停用，请先核对岗位状态',
  missing_rbac_permission: '岗位尚未授权所需功能，请在岗位设置中核对',
  active_revision_missing: '公司尚未启用配置版本',
  product_core_preview: '当前为产品默认预览，尚未核对公司启用配置',
  page_not_configured_or_projected: '公司配置尚未开放此页面，或未分配给该岗位',
  customer_entitlement_or_module_restricted:
    '公司配置限制了所需功能，请核对模块启用与岗位功能范围',
}

export function getPermissionPageAccessReason(page = {}) {
  if (page.effective === true) return '—'
  const reasons = (Array.isArray(page.reasons) ? page.reasons : [])
    .map((reason) => accessReasonLabels[reason.code] || reason.label)
    .filter(Boolean)
  return reasons.length
    ? [...new Set(reasons)].join('；')
    : '尚未取得具体原因，请重新核对页面访问结果'
}

// Navigation saves still contain every authorized page path. A module contributes
// one primary path; its other pages remain in the secondary list for validation.
export function buildRoleNavigationModules({
  options = [],
  primaryMenuPaths = [],
  secondaryMenuPaths = [],
} = {}) {
  const modules = new Map()
  const optionByPath = new Map(options.map((option) => [option.value, option]))
  for (const option of options) {
    const page = getPermissionPageEntry({
      ...option.menuItem,
      path: option.value,
      label: option.label,
    })
    const group = getBusinessModuleGroup(option.value)
    const key = getBusinessModuleSidebarKey(option.value)
    if (!modules.has(key)) {
      modules.set(key, {
        key,
        label: group?.label || page.label,
        sidebarArea: group ? 'business' : page.sidebarArea,
        pages: [],
      })
    }
    modules.get(key).pages.push({ ...option, label: page.label })
  }
  const seen = new Set()
  const pick = (paths) =>
    paths.flatMap((path) => {
      if (!optionByPath.has(path)) return []
      const key = getBusinessModuleSidebarKey(path)
      if (seen.has(key)) return []
      seen.add(key)
      return [{ ...modules.get(key), path }]
    })
  const primaryItems = pick(primaryMenuPaths)
  const secondaryItems = pick([...secondaryMenuPaths, ...optionByPath.keys()])
  return { primaryItems, secondaryItems }
}

export function serializeRoleNavigationModules({
  primaryItems = [],
  secondaryItems = [],
} = {}) {
  const primaryMenuPaths = primaryItems.map((item) => item.path)
  const primary = new Set(primaryMenuPaths)
  const secondaryMenuPaths = [
    ...new Set(
      [...secondaryItems, ...primaryItems].flatMap((item) => [
        item.path,
        ...item.pages.map((page) => page.value),
      ])
    ),
  ].filter((path) => !primary.has(path))
  return { primaryMenuPaths, secondaryMenuPaths }
}
