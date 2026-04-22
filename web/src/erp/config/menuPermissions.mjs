import { navigationItemRegistry } from './seedData.mjs'

export const PERMISSION_CENTER_PATH = '/erp/system/permissions'

const PERMISSION_NAV_KEYS = [
  'global-dashboard',
  'print-center',
  'help-operation-flow-overview',
  'help-operation-guide',
  'help-field-linkage-guide',
  'help-calculation-guide',
  'permission-center',
]

const PERMISSION_ALIAS_MAP = Object.freeze({
  '/erp/flows/overview': '/erp/docs/operation-flow-overview',
  '/erp/source-readiness': '/erp/docs/field-linkage-guide',
  '/erp/mobile-workbenches': '/erp/docs/operation-guide',
  '/erp/help-center': '/erp/docs/operation-guide',
  '/erp/docs/system-init': '/erp/docs/operation-guide',
  '/erp/docs/mobile-roles': '/erp/docs/operation-guide',
  '/erp/docs/operation-playbook': '/erp/docs/operation-flow-overview',
  '/erp/docs/field-truth': '/erp/docs/field-linkage-guide',
  '/erp/docs/import-mapping': '/erp/docs/field-linkage-guide',
  '/erp/docs/data-model': '/erp/docs/calculation-guide',
  '/erp/docs/print-templates': '/erp/docs/calculation-guide',
})

export const ERP_MENU_PERMISSION_OPTIONS = PERMISSION_NAV_KEYS.map((navKey) => {
  const item = navigationItemRegistry[navKey]
  return {
    key: item.path,
    label: item.label,
  }
})

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

export const getPermissionLabel = (key) => {
  const matched = ERP_MENU_PERMISSION_OPTIONS.find((item) => item.key === key)
  return matched?.label || key
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
