import { getNavigationSections } from './seedData.mjs'
import { mobileRoleDefinitions } from './appRegistry.mjs'
import { normalizeRoleKey } from '../utils/roleKeys.mjs'

export const PERMISSION_CENTER_PATH = '/erp/system/permissions'
export const SYSTEM_AUDIT_LOGS_PATH = '/erp/system/audit-logs'

const BUSINESS_SECTION_TITLES = Object.freeze([
  '主数据',
  '销售管理',
  '产品工程',
  '采购管理',
  '质检管理',
  '库存管理',
  '委外管理',
  '生产管理',
  '出货管理',
  '财务业务',
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
  mobileRoleDefinitions.map((role) => ({
    key: role.roleKey,
    label: role.shortTitle,
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

const masterModulePaths = collectSectionPaths(['主数据'])
const salesModulePaths = collectSectionPaths(['销售管理'])
const engineeringModulePaths = collectSectionPaths(['产品工程'])
const purchaseModulePaths = collectSectionPaths(['采购管理'])
const qualityModulePaths = collectSectionPaths(['质检管理'])
const warehouseModulePaths = collectSectionPaths(['库存管理'])
const outsourcingModulePaths = collectSectionPaths(['委外管理'])
const productionModulePaths = collectSectionPaths(['生产管理'])
const shipmentModulePaths = collectSectionPaths(['出货管理'])
const financeModulePaths = collectSectionPaths(['财务业务'])
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
    description:
      '看工作台、任务看板、业务看板、正式业务入口、异常闭环和打印中心，不含权限管理。',
    mobileRolePermissions: buildMobileRolePreset(['boss']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/task-board',
      '/erp/business-dashboard',
      '/erp/print-center',
      '/erp/operations/exceptions',
      ...businessModulePaths,
    ]),
  },
  {
    key: 'sales',
    label: '业务',
    description:
      '保留主数据、销售订单、出货放行、应收跟进、任务看板、业务看板、异常闭环和打印中心。',
    mobileRolePermissions: buildMobileRolePreset(['sales']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/task-board',
      '/erp/business-dashboard',
      '/erp/print-center',
      '/erp/operations/exceptions',
      ...masterModulePaths,
      ...salesModulePaths,
      '/erp/warehouse/shipping-release',
      '/erp/warehouse/shipments',
      '/erp/finance/receivables',
      '/erp/finance/invoices',
    ]),
  },
  {
    key: 'pmc',
    label: 'PMC',
    description:
      '保留任务看板、业务看板、主数据、产品工程、采购、库存、生产、委外、出货和异常闭环。',
    mobileRolePermissions: buildMobileRolePreset(['pmc']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/task-board',
      '/erp/business-dashboard',
      '/erp/operations/exceptions',
      ...masterModulePaths,
      ...engineeringModulePaths,
      ...purchaseModulePaths,
      ...warehouseModulePaths,
      ...outsourcingModulePaths,
      ...productionModulePaths,
      ...shipmentModulePaths,
    ]),
  },
  {
    key: 'production',
    label: '生产经理',
    description:
      '保留任务看板、业务看板、主数据、产品工程、委外、生产、质检和异常闭环。',
    mobileRolePermissions: buildMobileRolePreset(['production']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/task-board',
      '/erp/business-dashboard',
      '/erp/operations/exceptions',
      ...masterModulePaths,
      ...engineeringModulePaths,
      ...qualityModulePaths,
      ...outsourcingModulePaths,
      ...productionModulePaths,
    ]),
  },
  {
    key: 'purchase',
    label: '采购',
    description:
      '保留任务看板、业务看板、主数据、产品工程、采购、入库、来料质检、委外和打印中心。',
    mobileRolePermissions: buildMobileRolePreset(['purchase']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/task-board',
      '/erp/business-dashboard',
      '/erp/print-center',
      '/erp/operations/exceptions',
      ...masterModulePaths,
      ...engineeringModulePaths,
      ...purchaseModulePaths,
      '/erp/warehouse/inbound',
      ...qualityModulePaths,
      ...outsourcingModulePaths,
    ]),
  },
  {
    key: 'engineering',
    label: '工程',
    description:
      '保留任务看板、业务看板、主数据、产品工程和工程岗位任务端，不含采购、库存、生产、财务和权限管理。',
    mobileRolePermissions: buildMobileRolePreset(['engineering']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/task-board',
      '/erp/business-dashboard',
      ...masterModulePaths,
      ...engineeringModulePaths,
    ]),
  },
  {
    key: 'warehouse',
    label: '仓库',
    description:
      '保留任务看板、业务看板、主数据、入库、库存、出货、出库、来料质检和异常闭环。',
    mobileRolePermissions: buildMobileRolePreset(['warehouse']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/task-board',
      '/erp/business-dashboard',
      '/erp/operations/exceptions',
      ...masterModulePaths,
      ...qualityModulePaths,
      ...warehouseModulePaths,
      ...shipmentModulePaths,
    ]),
  },
  {
    key: 'quality',
    label: '品质',
    description:
      '保留任务看板、业务看板、主数据、入库、来料质检、生产异常、出货放行和异常闭环。',
    mobileRolePermissions: buildMobileRolePreset(['quality']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/task-board',
      '/erp/business-dashboard',
      '/erp/operations/exceptions',
      ...masterModulePaths,
      '/erp/warehouse/inbound',
      ...qualityModulePaths,
      '/erp/production/exceptions',
      '/erp/warehouse/shipping-release',
    ]),
  },
  {
    key: 'finance',
    label: '财务',
    description:
      '保留任务看板、业务看板、主数据、委外、出货、财务业务、异常闭环和打印中心。',
    mobileRolePermissions: buildMobileRolePreset(['finance']),
    permissions: buildPreset([
      '/erp/dashboard',
      '/erp/task-board',
      '/erp/business-dashboard',
      '/erp/print-center',
      '/erp/operations/exceptions',
      ...masterModulePaths,
      ...outsourcingModulePaths,
      ...shipmentModulePaths,
      ...financeModulePaths,
    ]),
  },
  {
    key: 'admin',
    label: '系统管理员',
    description:
      '只保留权限管理和审计日志入口；该角色不是 super admin，不天然拥有业务事实处理权。',
    mobileRolePermissions: buildMobileRolePreset([]),
    permissions: buildPreset([PERMISSION_CENTER_PATH, SYSTEM_AUDIT_LOGS_PATH]),
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
    const normalizedKey = String(rawKey || '').trim()
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
    (item) =>
      item.key !== PERMISSION_CENTER_PATH && item.key !== SYSTEM_AUDIT_LOGS_PATH
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
  return matched?.label || (key ? '岗位入口' : '')
}

export const getPermissionLabel = (key) => {
  const matched = ERP_MENU_PERMISSION_OPTIONS.find((item) => item.key === key)
  return matched?.label || (key ? '菜单权限' : '')
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
  const normalizedPath = String(pathname || '').trim()
  if (!normalizedPath) {
    return ''
  }

  return (
    orderedPermissionKeys.find(
      (key) => normalizedPath === key || normalizedPath.startsWith(`${key}/`)
    ) || ''
  )
}
