import { getNavigationSections } from './seedData.mjs'
import { appDefinitions } from './appRegistry.mjs'

export const PERMISSION_CENTER_PATH = '/erp/system/permissions'

const PERMISSION_ALIAS_MAP = Object.freeze({
  '/erp/flows/overview': '/erp/docs/operation-flow-overview',
  '/erp/source-readiness': '/erp/docs/field-linkage-guide',
  '/erp/mobile-workbenches': '/erp/docs/operation-guide',
  '/erp/help-center': '/erp/docs/operation-flow-overview',
  '/erp/docs/system-init': '/erp/docs/operation-guide',
  '/erp/docs/mobile-roles': '/erp/docs/mobile-role-guide',
  '/erp/docs/operation-playbook': '/erp/docs/operation-flow-overview',
  '/erp/docs/field-truth': '/erp/docs/field-linkage-guide',
  '/erp/docs/import-mapping': '/erp/docs/field-linkage-guide',
  '/erp/docs/data-model': '/erp/docs/calculation-guide',
  '/erp/docs/print-templates': '/erp/docs/print-snapshot-guide',
})

const BUSINESS_SECTION_TITLES = Object.freeze([
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

const helpDocPaths = collectSectionPaths(['帮助中心'])
const businessModulePaths = collectSectionPaths(BUSINESS_SECTION_TITLES)

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
    description: '看全链路业务页、打印中心和全部帮助中心，不含权限管理。',
    mobileRolePermissions: buildMobileRolePreset(['boss']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      '/erp/print-center',
      ...businessModulePaths,
      ...helpDocPaths,
    ]),
  },
  {
    key: 'merchandiser',
    label: '业务 / 跟单',
    description: '保留立项、待出货和相关帮助文档。',
    mobileRolePermissions: buildMobileRolePreset(['merchandiser']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      '/erp/print-center',
      '/erp/sales/project-orders',
      '/erp/warehouse/shipping-release',
      ...helpDocPaths,
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
      '/erp/purchase/material-bom',
      '/erp/purchase/accessories',
      '/erp/purchase/processing-contracts',
      '/erp/warehouse/inbound',
      '/erp/warehouse/shipping-release',
      '/erp/production/scheduling',
      '/erp/production/progress',
      '/erp/production/exceptions',
      '/erp/production/quality-inspections',
      ...helpDocPaths,
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
      '/erp/warehouse/inbound',
      '/erp/production/scheduling',
      '/erp/production/progress',
      '/erp/production/exceptions',
      '/erp/production/quality-inspections',
      ...helpDocPaths,
    ]),
  },
  {
    key: 'purchasing',
    label: '采购',
    description: '保留主料、辅包材、加工合同、入库协同和打印中心。',
    mobileRolePermissions: buildMobileRolePreset(['purchasing']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      '/erp/print-center',
      '/erp/purchase/material-bom',
      '/erp/purchase/accessories',
      '/erp/purchase/processing-contracts',
      '/erp/warehouse/inbound',
      ...helpDocPaths,
    ]),
  },
  {
    key: 'warehouse',
    label: '仓库',
    description: '保留收货、库存、待出货、出库和相关帮助中心入口。',
    mobileRolePermissions: buildMobileRolePreset(['warehouse']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      '/erp/warehouse/inbound',
      '/erp/warehouse/inventory',
      '/erp/warehouse/shipping-release',
      '/erp/warehouse/outbound',
      ...helpDocPaths,
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
      '/erp/warehouse/inbound',
      '/erp/warehouse/inventory',
      '/erp/warehouse/shipping-release',
      '/erp/production/quality-inspections',
      '/erp/production/exceptions',
      ...helpDocPaths,
    ]),
  },
  {
    key: 'finance',
    label: '财务',
    description: '保留放行、对账、待付款、打印中心和帮助中心入口。',
    mobileRolePermissions: buildMobileRolePreset(['finance']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/business-dashboard',
      '/erp/print-center',
      '/erp/purchase/processing-contracts',
      '/erp/warehouse/shipping-release',
      '/erp/finance/reconciliation',
      '/erp/finance/payables',
      '/erp/finance/receivables',
      '/erp/finance/invoices',
      ...helpDocPaths,
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
    const key = String(rawKey || '').trim()
    const normalizedKey = PERMISSION_ALIAS_MAP[key] || key
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
    const key = String(rawKey || '').trim()
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
  const rawPath = String(pathname || '').trim()
  const normalizedPath = PERMISSION_ALIAS_MAP[rawPath] || rawPath
  if (!normalizedPath) {
    return ''
  }

  return (
    orderedPermissionKeys.find(
      (key) => normalizedPath === key || normalizedPath.startsWith(`${key}/`)
    ) || ''
  )
}
