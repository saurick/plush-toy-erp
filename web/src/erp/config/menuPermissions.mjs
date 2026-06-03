import { getNavigationSections } from './seedData.mjs'
import { appDefinitions } from './appRegistry.mjs'
import { normalizeRoleKey } from '../utils/roleKeys.mjs'

export const PERMISSION_CENTER_PATH = '/erp/system/permissions'

const PERMISSION_ALIAS_MAP = Object.freeze({
  '/erp/flows/overview': '/erp/dashboard',
  '/erp/source-readiness': '/erp/dashboard',
  '/erp/mobile-workbenches': '/erp/dashboard',
  '/erp/help-center': '/erp/dashboard',
})

const BUSINESS_SECTION_TITLES = Object.freeze([
  '基础资料',
  '销售链路',
  '采购/仓储',
  '生产环节',
  '财务环节',
])

const rawPermissionGroups = getNavigationSections()
  .map((section) => ({
    title: section.title,
    items: (section.items || []).map((item) => ({
      key: item.path,
      label: item.label,
    })),
  }))
  .filter((section) => section.items.length > 0)

export const ERP_MENU_PERMISSION_GROUPS = Object.freeze(rawPermissionGroups)

export const ERP_MENU_PERMISSION_OPTIONS = Object.freeze(
  ERP_MENU_PERMISSION_GROUPS.flatMap((section) => section.items)
)

export const ERP_MOBILE_ROLE_PERMISSION_OPTIONS = Object.freeze(
  appDefinitions
    .filter((app) => app.kind === 'mobile' && app.roleKey)
    .map((app) => ({
      key: app.roleKey,
      label: app.shortTitle,
    }))
)

const sectionPathMap = Object.freeze(
  Object.fromEntries(
    ERP_MENU_PERMISSION_GROUPS.map((section) => [
      section.title,
      section.items.map((item) => item.key),
    ])
  )
)

function uniquePaths(paths = []) {
  return [...new Set((paths || []).filter(Boolean))]
}

function collectSectionPaths(sectionTitles = []) {
  return uniquePaths(
    sectionTitles.flatMap((title) => sectionPathMap[title] || [])
  )
}

const masterModulePaths = collectSectionPaths(['基础资料'])
const businessModulePaths = collectSectionPaths(BUSINESS_SECTION_TITLES)

function normalizePermissionAlias(path = '') {
  const key = String(path || '').trim()
  if (key.startsWith('/erp/docs/') || key.startsWith('/erp/qa/')) {
    return '/erp/dashboard'
  }
  return PERMISSION_ALIAS_MAP[key] || key
}

function buildPreset(paths = []) {
  return uniquePaths(paths).filter((path) =>
    ERP_MENU_PERMISSION_OPTIONS.some((item) => item.key === path)
  )
}

function buildMobileRolePreset(roleKeys = []) {
  const allowed = new Set(
    ERP_MOBILE_ROLE_PERMISSION_OPTIONS.map((item) => item.key)
  )
  return uniquePaths(roleKeys).filter((roleKey) => allowed.has(roleKey))
}

export const ERP_PERMISSION_PRESETS = Object.freeze([
  {
    key: 'boss',
    label: '老板 / 管理层',
    description: '看全链路业务页和打印中心，不含权限管理。',
    mobileRolePermissions: buildMobileRolePreset(['boss']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      '/erp/print-center',
      ...businessModulePaths,
    ]),
  },
  {
    key: 'sales',
    label: '业务',
    description: '保留立项、待出货和打印中心。',
    mobileRolePermissions: buildMobileRolePreset(['sales']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      '/erp/print-center',
      ...masterModulePaths,
      '/erp/sales/project-orders',
      '/erp/warehouse/shipping-release',
    ]),
  },
  {
    key: 'pmc',
    label: 'PMC',
    description: '保留齐套、排产、进度、异常及必要的采购跟进入口。',
    mobileRolePermissions: buildMobileRolePreset(['pmc']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      ...masterModulePaths,
      '/erp/purchase/material-bom',
      '/erp/purchase/accessories',
      '/erp/purchase/processing-contracts',
      '/erp/warehouse/inbound',
      '/erp/warehouse/shipping-release',
      '/erp/production/scheduling',
      '/erp/production/progress',
      '/erp/production/exceptions',
      '/erp/production/quality-inspections',
    ]),
  },
  {
    key: 'production',
    label: '生产经理',
    description: '保留排单、进度、返工异常和送检协同入口。',
    mobileRolePermissions: buildMobileRolePreset(['production']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      ...masterModulePaths,
      '/erp/warehouse/inbound',
      '/erp/production/scheduling',
      '/erp/production/progress',
      '/erp/production/exceptions',
      '/erp/production/quality-inspections',
    ]),
  },
  {
    key: 'purchase',
    label: '采购',
    description: '保留主料、辅包材、加工合同、入库协同和打印中心。',
    mobileRolePermissions: buildMobileRolePreset(['purchase']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      '/erp/print-center',
      ...masterModulePaths,
      '/erp/purchase/material-bom',
      '/erp/purchase/accessories',
      '/erp/purchase/processing-contracts',
      '/erp/warehouse/inbound',
    ]),
  },
  {
    key: 'warehouse',
    label: '仓库',
    description: '保留收货、库存、待出货和出库入口。',
    mobileRolePermissions: buildMobileRolePreset(['warehouse']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      ...masterModulePaths,
      '/erp/warehouse/inbound',
      '/erp/warehouse/inventory',
      '/erp/warehouse/shipping-release',
      '/erp/warehouse/outbound',
    ]),
  },
  {
    key: 'quality',
    label: '品质',
    description: '保留检验、异常、待出货质检协同入口。',
    mobileRolePermissions: buildMobileRolePreset(['quality']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      ...masterModulePaths,
      '/erp/warehouse/inbound',
      '/erp/warehouse/inventory',
      '/erp/warehouse/shipping-release',
      '/erp/production/quality-inspections',
      '/erp/production/exceptions',
    ]),
  },
  {
    key: 'finance',
    label: '财务',
    description: '保留放行、对账、待付款和打印中心入口。',
    mobileRolePermissions: buildMobileRolePreset(['finance']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      '/erp/print-center',
      ...masterModulePaths,
      '/erp/purchase/processing-contracts',
      '/erp/warehouse/shipping-release',
      '/erp/finance/reconciliation',
      '/erp/finance/payables',
      '/erp/finance/receivables',
      '/erp/finance/invoices',
    ]),
  },
])

const permissionSet = new Set(
  ERP_MENU_PERMISSION_OPTIONS.map((item) => item.key)
)

const orderedPermissionKeys = ERP_MENU_PERMISSION_OPTIONS.map(
  (item) => item.key
)
  .slice()
  .sort((left, right) => right.length - left.length)

export const normalizeMenuPermissions = (permissions = []) => {
  if (!Array.isArray(permissions)) {
    return []
  }

  const selected = new Set()
  permissions.forEach((rawKey) => {
    const normalizedKey = normalizePermissionAlias(rawKey)
    if (!normalizedKey || !permissionSet.has(normalizedKey)) {
      return
    }
    selected.add(normalizedKey)
  })

  return ERP_MENU_PERMISSION_OPTIONS.map((item) => item.key).filter((key) =>
    selected.has(key)
  )
}

export const defaultMenuPermissions = () =>
  ERP_MENU_PERMISSION_OPTIONS.filter(
    (item) => item.key !== PERMISSION_CENTER_PATH
  ).map((item) => item.key)

export const normalizeMobileRolePermissions = (permissions = []) => {
  if (!Array.isArray(permissions)) {
    return []
  }

  const permissionSet = new Set(
    ERP_MOBILE_ROLE_PERMISSION_OPTIONS.map((item) => item.key)
  )
  const selected = new Set()
  permissions.forEach((rawKey) => {
    const key = normalizeRoleKey(rawKey)
    if (key && permissionSet.has(key)) {
      selected.add(key)
    }
  })
  return ERP_MOBILE_ROLE_PERMISSION_OPTIONS.map((item) => item.key).filter(
    (key) => selected.has(key)
  )
}

export const getMobileRolePermissionLabel = (key) => {
  const matched = ERP_MOBILE_ROLE_PERMISSION_OPTIONS.find(
    (item) => item.key === key
  )
  return matched?.label || key
}

export const getPermissionLabel = (key) => {
  const matched = ERP_MENU_PERMISSION_OPTIONS.find((item) => item.key === key)
  return matched?.label || key
}

export const getPermissionPreset = (presetKey) =>
  ERP_PERMISSION_PRESETS.find((item) => item.key === presetKey) || null

export const matchPermissionPreset = (permissions = []) => {
  const normalized = normalizeMenuPermissions(permissions)
  return (
    ERP_PERMISSION_PRESETS.find((preset) => {
      if (preset.permissions.length !== normalized.length) {
        return false
      }
      return preset.permissions.every(
        (item, index) => item === normalized[index]
      )
    })?.key || ''
  )
}

export const resolveMenuPermissionKey = (pathname = '') => {
  const normalizedPath = normalizePermissionAlias(pathname)
  if (!normalizedPath) {
    return ''
  }

  return (
    orderedPermissionKeys.find(
      (key) => normalizedPath === key || normalizedPath.startsWith(`${key}/`)
    ) || ''
  )
}
