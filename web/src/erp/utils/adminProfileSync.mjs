import { isAdminSessionUnavailableCode } from '../../common/consts/errorCodes.js'

const EFFECTIVE_SESSION_SYNC_FAILED_SOURCE = 'effective_session_sync_failed'
const VISIBILITY_MODE_SUPER_ADMIN_PRODUCT_CORE = 'super_admin_product_core'
const VISIBILITY_MODE_LOCAL_DEV_SYNC_FAILED = 'local_dev_sync_failed_diagnostic'
const VISIBILITY_MODE_LOCAL_DEV_CUSTOMER_CONFIG =
  'local_dev_customer_config_diagnostic'
const VISIBILITY_MODE_FORMAL_EFFECTIVE_SESSION =
  'formal_effective_session_projection'
const DATA_RUNTIME_SCOPE_CUSTOMER = 'customer_runtime'
const DATA_RUNTIME_SCOPE_PRODUCT_CORE_REVIEW = 'product_core_review'
const DATA_RUNTIME_SCOPE_SYNC_FAILED = 'sync_failed_diagnostic'
const DATA_RUNTIME_SCOPE_CUSTOMER_MISSING = 'customer_runtime_missing'
const PRINT_PARTY_DEFAULT_KEYS = new Set([
  'buyerCompany',
  'buyerContact',
  'buyerPhone',
  'buyerAddress',
  'buyerSigner',
])

const DEFAULT_FIELD_POLICY_SURFACE_BY_MODULE = Object.freeze({
  customers: 'customers.default',
  suppliers: 'suppliers.default',
  sales_orders: 'sales_orders.default',
  'sales-orders': 'sales_orders.default',
  sales_order_items: 'sales_order_items.default',
  purchase_orders: 'purchase_orders.default',
  'accessories-purchase': 'purchase_orders.default',
  purchase_order_items: 'purchase_order_items.default',
  purchase_receipts: 'purchase_receipts.default',
  quality_inspections: 'quality_inspections.default',
  'quality-inspections': 'quality_inspections.default',
  inventory_lots: 'inventory_lots.default',
  inventory_txns: 'inventory_txns.default',
  shipments: 'shipments.default',
  outsourcing_orders: 'outsourcing_orders.default',
  'processing-contracts': 'outsourcing_orders.default',
  finance_facts: 'finance_facts.default',
})

const PRODUCT_CORE_ACTION_KEYS = new Set([
  'bom.activate',
  'bom.create',
  'bom.read',
  'bom.update',
  'contact.create',
  'contact.disable',
  'contact.read',
  'contact.set_primary',
  'contact.update',
  'customer.create',
  'customer.disable',
  'customer.read',
  'customer.update',
  'customer_config.activate',
  'customer_config.publish',
  'customer_config.read',
  'customer_config.rollback',
  'erp.business_chain_debug.read',
  'erp.dashboard.read',
  'erp.print_template.read',
  'finance.payable.confirm',
  'finance.payable.read',
  'finance.receivable.confirm',
  'finance.receivable.read',
  'finance.report.read',
  'material.create',
  'material.disable',
  'material.read',
  'material.update',
  'outsourcing.order.confirm',
  'outsourcing.order.create',
  'outsourcing.order.read',
  'outsourcing.order.update',
  'pmc.plan.create',
  'pmc.plan.read',
  'pmc.plan.update',
  'pmc.risk.handle',
  'pmc.risk.read',
  'process.create',
  'process.disable',
  'process.read',
  'process.update',
  'product.create',
  'product.disable',
  'product.read',
  'product.update',
  'product_sku.create',
  'product_sku.disable',
  'product_sku.read',
  'product_sku.update',
  'purchase.order.approve',
  'purchase.order.create',
  'purchase.order.read',
  'purchase.order.update',
  'purchase.receipt.create',
  'purchase.receipt.read',
  'purchase.return.create',
  'purchase.return.read',
  'quality.exception.handle',
  'quality.inspection.create',
  'quality.inspection.read',
  'quality.inspection.update',
  'sales_order.activate',
  'sales_order.cancel',
  'sales_order.close',
  'sales_order.create',
  'sales_order.read',
  'sales_order.submit',
  'sales_order.update',
  'sales_order_item.cancel',
  'sales_order_item.create',
  'sales_order_item.read',
  'sales_order_item.update',
  'shipment.cancel',
  'shipment.create',
  'shipment.read',
  'shipment.ship',
  'supplier.create',
  'supplier.disable',
  'supplier.read',
  'supplier.update',
  'system.audit.read',
  'system.permission.manage',
  'system.permission.read',
  'system.role.create',
  'system.role.delete',
  'system.role.read',
  'system.role.update',
  'system.user.create',
  'system.user.disable',
  'system.user.read',
  'system.user.update',
  'warehouse.adjustment.create',
  'warehouse.inbound.confirm',
  'warehouse.inbound.read',
  'warehouse.inventory.read',
  'warehouse.outbound.confirm',
  'warehouse.outbound.read',
  'workflow.task.approve',
  'workflow.task.assign',
  'workflow.task.complete',
  'workflow.task.create',
  'workflow.task.read',
  'workflow.task.reject',
  'workflow.task.update',
])

function isLocalDevRuntime() {
  return import.meta.env?.DEV === true
}

function countFieldPolicyEntries(fieldPolicies) {
  if (!fieldPolicies || typeof fieldPolicies !== 'object') {
    return { surfaces: 0, fields: 0, hiddenFields: 0 }
  }
  return Object.values(fieldPolicies).reduce(
    (acc, surfacePolicies) => {
      if (!surfacePolicies || typeof surfacePolicies !== 'object') {
        return acc
      }
      acc.surfaces += 1
      Object.values(surfacePolicies).forEach((policy) => {
        if (!policy || typeof policy !== 'object') {
          return
        }
        acc.fields += 1
        if (policy.visible === false) {
          acc.hiddenFields += 1
        }
      })
      return acc
    },
    { surfaces: 0, fields: 0, hiddenFields: 0 }
  )
}

function countVisibleMenuItems(visibleSections) {
  return (Array.isArray(visibleSections) ? visibleSections : []).reduce(
    (sum, section) =>
      sum + (Array.isArray(section?.items) ? section.items.length : 0),
    0
  )
}

function resolveEffectiveSessionVisibilityMode({
  isSuperAdmin = false,
  isLocalDev = false,
  source = '',
} = {}) {
  if (isSuperAdmin) {
    return VISIBILITY_MODE_SUPER_ADMIN_PRODUCT_CORE
  }
  if (isLocalDev && source === EFFECTIVE_SESSION_SYNC_FAILED_SOURCE) {
    return VISIBILITY_MODE_LOCAL_DEV_SYNC_FAILED
  }
  if (isLocalDev) {
    return VISIBILITY_MODE_LOCAL_DEV_CUSTOMER_CONFIG
  }
  return VISIBILITY_MODE_FORMAL_EFFECTIVE_SESSION
}

function resolveEffectiveSessionDataRuntimeScope({
  customerKey = '',
  source = '',
  isSuperAdmin = false,
} = {}) {
  if (typeof customerKey === 'string' && customerKey.trim()) {
    return DATA_RUNTIME_SCOPE_CUSTOMER
  }
  if (source === EFFECTIVE_SESSION_SYNC_FAILED_SOURCE) {
    return DATA_RUNTIME_SCOPE_SYNC_FAILED
  }
  if (isSuperAdmin) {
    return DATA_RUNTIME_SCOPE_PRODUCT_CORE_REVIEW
  }
  return DATA_RUNTIME_SCOPE_CUSTOMER_MISSING
}

export function buildEffectiveSessionDiagnosticSummary({
  adminProfile = null,
  allowedMenuPaths = [],
  visibleSections = [],
  isSuperAdmin = false,
  isLocalDev = isLocalDevRuntime(),
} = {}) {
  const session = adminProfile?.effective_session
  const hasSession = Boolean(session && typeof session === 'object')
  const pages = Array.isArray(session?.pages) ? session.pages : []
  const actions = Array.isArray(session?.actions) ? session.actions : []
  const roles = Array.isArray(session?.roles) ? session.roles : []
  const workPools = Array.isArray(session?.work_pools) ? session.work_pools : []
  const modules =
    session?.modules && typeof session.modules === 'object'
      ? session.modules
      : {}
  const fieldPolicyCounts = countFieldPolicyEntries(session?.field_policies)
  const visibleMenuItems = countVisibleMenuItems(visibleSections)
  const blockers = []

  if (!hasSession) {
    blockers.push('effective_session_missing')
  }
  if (session?.source === EFFECTIVE_SESSION_SYNC_FAILED_SOURCE) {
    blockers.push('effective_session_sync_failed')
  }
  if (hasSession && Array.isArray(session?.pages) && pages.length === 0) {
    blockers.push('effective_session_pages_empty')
  }
  if (!isSuperAdmin && visibleMenuItems === 0) {
    blockers.push('no_visible_menu_items')
  }

  const source = hasSession ? session.source || 'unknown' : 'missing'
  const customerKey = session?.customer?.key || ''
  const visibilityMode = resolveEffectiveSessionVisibilityMode({
    isSuperAdmin,
    isLocalDev,
    source,
  })
  const dataRuntimeScope = resolveEffectiveSessionDataRuntimeScope({
    customerKey,
    source,
    isSuperAdmin,
  })
  const canMountCustomerBusinessPages =
    dataRuntimeScope === DATA_RUNTIME_SCOPE_CUSTOMER

  return {
    source,
    customerKey,
    configRevision: session?.config_revision || '',
    projectionMode: visibilityMode,
    visibilityMode,
    dataRuntimeScope,
    canMountCustomerBusinessPages,
    isSuperAdmin: isSuperAdmin === true,
    isLocalDev: isLocalDev === true,
    counts: {
      rbacMenuPaths: Array.isArray(allowedMenuPaths)
        ? allowedMenuPaths.length
        : 0,
      visibleMenuItems,
      pages: pages.length,
      actions: actions.length,
      roles: roles.length,
      workPools: workPools.length,
      modules: Object.keys(modules).length,
      fieldPolicySurfaces: fieldPolicyCounts.surfaces,
      fieldPolicyFields: fieldPolicyCounts.fields,
      hiddenFieldPolicies: fieldPolicyCounts.hiddenFields,
    },
    blockers,
  }
}

export function shouldGuardCustomerBusinessPageRuntime({
  effectiveSessionDiagnostic = null,
  isCustomerBusinessDataPage = false,
} = {}) {
  return Boolean(
    isCustomerBusinessDataPage &&
      effectiveSessionDiagnostic &&
      effectiveSessionDiagnostic.canMountCustomerBusinessPages === false
  )
}

export function canMountCustomerRuntime(adminProfile) {
  const customerKey = adminProfile?.effective_session?.customer?.key
  return typeof customerKey === 'string' && customerKey.trim().length > 0
}

export function attachEffectiveSessionToAdminProfile(
  profile,
  effectiveSession
) {
  if (!profile || typeof profile !== 'object') {
    return profile || null
  }
  if (!effectiveSession || typeof effectiveSession !== 'object') {
    return {
      ...profile,
      effective_session: null,
    }
  }
  return {
    ...profile,
    effective_session: {
      config_revision:
        effectiveSession.configRevision ||
        effectiveSession.config_revision ||
        '',
      config_hash:
        effectiveSession.configHash || effectiveSession.config_hash || '',
      customer: effectiveSession.customer || null,
      modules:
        effectiveSession.modules && typeof effectiveSession.modules === 'object'
          ? effectiveSession.modules
          : {},
      roles: Array.isArray(effectiveSession.roles)
        ? effectiveSession.roles
        : [],
      pages: Array.isArray(effectiveSession.pages)
        ? effectiveSession.pages
        : [],
      actions: Array.isArray(effectiveSession.actions)
        ? effectiveSession.actions
        : [],
      work_pools: Array.isArray(effectiveSession.workPools)
        ? effectiveSession.workPools
        : Array.isArray(effectiveSession.work_pools)
          ? effectiveSession.work_pools
          : [],
      field_policies:
        effectiveSession.fieldPolicies &&
        typeof effectiveSession.fieldPolicies === 'object'
          ? effectiveSession.fieldPolicies
          : effectiveSession.field_policies &&
              typeof effectiveSession.field_policies === 'object'
            ? effectiveSession.field_policies
            : {},
      print_template_defaults:
        effectiveSession.printTemplateDefaults &&
        typeof effectiveSession.printTemplateDefaults === 'object'
          ? effectiveSession.printTemplateDefaults
          : effectiveSession.print_template_defaults &&
              typeof effectiveSession.print_template_defaults === 'object'
            ? effectiveSession.print_template_defaults
            : {},
      source: effectiveSession.source || '',
    },
  }
}

export function attachUnavailableEffectiveSessionToAdminProfile(profile) {
  return attachEffectiveSessionToAdminProfile(profile, {
    pages: [],
    actions: [],
    workPools: [],
    fieldPolicies: {},
    source: EFFECTIVE_SESSION_SYNC_FAILED_SOURCE,
  })
}

export function resolveEffectiveSessionCustomerKey(activeBrand = {}) {
  const customerKey =
    typeof activeBrand?.customerKey === 'string'
      ? activeBrand.customerKey.trim()
      : ''
  return customerKey || ''
}

export function resolveEffectiveSessionPageAccess(
  adminProfile,
  pageKey,
  { isSuperAdmin = false, isLocalDev = isLocalDevRuntime() } = {}
) {
  const normalizedPageKey = typeof pageKey === 'string' ? pageKey.trim() : ''
  if (!normalizedPageKey) {
    return { allowed: true, reason: 'empty_page_key' }
  }
  const session = adminProfile?.effective_session
  const pages = session?.pages
  if (!Array.isArray(pages)) {
    if (isLocalDev) {
      return { allowed: true, reason: 'local_dev_customer_config_diagnostic' }
    }
    if (isSuperAdmin) {
      return { allowed: true, reason: 'super_admin_product_core' }
    }
    return { allowed: false, reason: 'effective_session_pages_missing' }
  }
  if (pages.includes(normalizedPageKey)) {
    return { allowed: true, reason: 'effective_session_page' }
  }
  if (isLocalDev) {
    return {
      allowed: true,
      reason:
        session?.source === EFFECTIVE_SESSION_SYNC_FAILED_SOURCE
          ? 'local_dev_sync_failed_diagnostic'
          : 'local_dev_customer_config_diagnostic',
    }
  }
  if (isSuperAdmin) {
    return { allowed: true, reason: 'super_admin_product_core' }
  }
  return { allowed: false, reason: 'effective_session_page_blocked' }
}

export function effectiveSessionAllowsPage(
  adminProfile,
  pageKey,
  options = {}
) {
  return resolveEffectiveSessionPageAccess(adminProfile, pageKey, options)
    .allowed
}

export function filterNavigationSectionsByAdminProfile({
  navigationSections = [],
  adminProfile = null,
  allowedMenuPaths = [],
  isSuperAdmin = false,
} = {}) {
  const allowedPaths = new Set(
    Array.isArray(allowedMenuPaths) ? allowedMenuPaths : []
  )
  return (Array.isArray(navigationSections) ? navigationSections : [])
    .map((section) => ({
      ...section,
      items: (Array.isArray(section?.items) ? section.items : []).filter(
        (item) => {
          const rbacAllowed = isSuperAdmin || allowedPaths.has(item?.path)
          return (
            rbacAllowed &&
            effectiveSessionAllowsPage(adminProfile, item?.key, {
              // Local-dev page diagnostics are direct-URL only; side navigation
              // still mirrors active pages for ordinary accounts.
              isLocalDev: false,
              isSuperAdmin,
            })
          )
        }
      ),
    }))
    .filter((section) => section.items.length > 0)
}

export function shouldRedirectFromCurrentNavigation({
  profileLoading = false,
  adminProfile = null,
  allowedMenuPaths = [],
  isSuperAdmin = false,
  isLocalDev = isLocalDevRuntime(),
  currentMenuPath = '',
  currentPageKey = '',
  currentNavigationMatched = true,
} = {}) {
  if (profileLoading) {
    return false
  }
  if (currentNavigationMatched === false) {
    return true
  }
  const normalizedMenuPath =
    typeof currentMenuPath === 'string' ? currentMenuPath.trim() : ''
  const allowedPaths = new Set(
    Array.isArray(allowedMenuPaths) ? allowedMenuPaths : []
  )
  const rbacAllowed =
    isSuperAdmin || !normalizedMenuPath || allowedPaths.has(normalizedMenuPath)
  return (
    !rbacAllowed ||
    !effectiveSessionAllowsPage(adminProfile, currentPageKey, {
      isLocalDev,
      isSuperAdmin,
    })
  )
}

export function hasEffectiveSessionAction(adminProfile, actionKey) {
  const normalizedActionKey =
    typeof actionKey === 'string' ? actionKey.trim() : ''
  if (!normalizedActionKey) {
    return false
  }
  const actions = adminProfile?.effective_session?.actions
  if (!Array.isArray(actions) || actions.length === 0) {
    return false
  }
  return actions.includes(normalizedActionKey)
}

export function effectiveSessionAllowsAction(adminProfile, actionKey) {
  const normalizedActionKey =
    typeof actionKey === 'string' ? actionKey.trim() : ''
  if (!normalizedActionKey) {
    return false
  }
  const session = adminProfile?.effective_session
  const sessionActions = Array.isArray(session?.actions) ? session.actions : []
  const rbacActions = Array.isArray(adminProfile?.permissions)
    ? adminProfile.permissions
    : []
  if (adminProfile?.is_super_admin === true) {
    return (
      PRODUCT_CORE_ACTION_KEYS.has(normalizedActionKey) ||
      sessionActions.includes(normalizedActionKey) ||
      rbacActions.includes(normalizedActionKey)
    )
  }
  if (!session || typeof session !== 'object') {
    return false
  }
  if (!Array.isArray(session.actions)) {
    return false
  }
  return session.actions.includes(normalizedActionKey)
}

export function getEffectiveFieldPolicy(adminProfile, surfaceKey, fieldKey) {
  const surface = typeof surfaceKey === 'string' ? surfaceKey.trim() : ''
  const field = typeof fieldKey === 'string' ? fieldKey.trim() : ''
  if (!surface || !field) {
    return null
  }
  const policies = adminProfile?.effective_session?.field_policies
  if (!policies || typeof policies !== 'object') {
    return null
  }
  const surfacePolicies = policies[surface]
  if (!surfacePolicies || typeof surfacePolicies !== 'object') {
    return null
  }
  const policy = surfacePolicies[field]
  return policy && typeof policy === 'object' ? policy : null
}

export function isEffectiveFieldVisible(adminProfile, surfaceKey, fieldKey) {
  if (adminProfile?.is_super_admin === true) {
    return true
  }
  const policy = getEffectiveFieldPolicy(adminProfile, surfaceKey, fieldKey)
  if (!policy || !Object.prototype.hasOwnProperty.call(policy, 'visible')) {
    return true
  }
  return policy.visible !== false
}

export function resolveDefaultFieldPolicySurface(moduleKey = '') {
  const normalizedModuleKey = String(moduleKey || '').trim()
  if (!normalizedModuleKey) return ''
  return (
    DEFAULT_FIELD_POLICY_SURFACE_BY_MODULE[normalizedModuleKey] ||
    `${normalizedModuleKey}.default`
  )
}

export function getEffectivePrintTemplateDefaults(adminProfile, templateKey) {
  const normalizedTemplateKey =
    typeof templateKey === 'string' ? templateKey.trim() : ''
  if (!normalizedTemplateKey) {
    return {}
  }
  const defaults = adminProfile?.effective_session?.print_template_defaults
  if (!defaults || typeof defaults !== 'object') {
    return {}
  }
  const templates = Array.isArray(defaults.templates) ? defaults.templates : []
  const item = templates.find(
    (template) => template?.template_key === normalizedTemplateKey
  )
  if (!item || item.supplier_defaults_allowed === true) {
    return {}
  }
  const partyDefaults =
    item.party_defaults && typeof item.party_defaults === 'object'
      ? item.party_defaults
      : {}
  const cleanPartyDefaults = Object.fromEntries(
    Object.entries(partyDefaults).filter(
      ([key, value]) =>
        PRINT_PARTY_DEFAULT_KEYS.has(key) &&
        typeof value === 'string' &&
        value.trim()
    )
  )
  if (Object.keys(cleanPartyDefaults).length === 0) {
    return {}
  }
  return {
    templates: [
      {
        template_key: normalizedTemplateKey,
        party_defaults: cleanPartyDefaults,
        supplier_defaults_allowed: false,
      },
    ],
  }
}

function resolveColumnFieldKey(column = {}) {
  if (typeof column.effectiveFieldKey === 'string') {
    return column.effectiveFieldKey.trim()
  }
  if (typeof column.dataIndex === 'string') {
    return column.dataIndex.trim()
  }
  if (Array.isArray(column.dataIndex)) {
    return column.dataIndex.filter(Boolean).join('.')
  }
  if (typeof column.key === 'string') {
    return column.key.trim()
  }
  return ''
}

export function filterColumnsByEffectiveFieldPolicy(
  columns = [],
  adminProfile = null,
  surfaceKey = ''
) {
  const normalizedColumns = Array.isArray(columns) ? columns : []
  const surface = typeof surfaceKey === 'string' ? surfaceKey.trim() : ''
  if (!surface) {
    return normalizedColumns
  }
  return normalizedColumns.filter((column) => {
    const fieldKey = resolveColumnFieldKey(column)
    return !fieldKey || isEffectiveFieldVisible(adminProfile, surface, fieldKey)
  })
}

export function applyEffectiveFieldPolicyFlags({
  adminProfile = null,
  moduleKey = '',
  surfaceKey = '',
  columns = [],
} = {}) {
  const normalizedColumns = Array.isArray(columns) ? columns : []
  const surface =
    (typeof surfaceKey === 'string' ? surfaceKey.trim() : '') ||
    resolveDefaultFieldPolicySurface(moduleKey)
  for (const column of normalizedColumns) {
    if (!column || typeof column !== 'object') continue
    const fieldKey = resolveColumnFieldKey(column)
    const hidden = Boolean(
      surface &&
        fieldKey &&
        !isEffectiveFieldVisible(adminProfile, surface, fieldKey)
    )
    if (hidden) {
      column.hiddenByEffectiveFieldPolicy = true
    } else if (
      Object.prototype.hasOwnProperty.call(
        column,
        'hiddenByEffectiveFieldPolicy'
      )
    ) {
      delete column.hiddenByEffectiveFieldPolicy
    }
  }
  return normalizedColumns
}

export function getAdminProfileSyncErrorAction(
  error,
  { hasCachedProfile = false, alreadyNotified = false } = {}
) {
  if (isAdminSessionUnavailableCode(error?.code)) {
    return 'reauth'
  }
  if (hasCachedProfile) {
    return 'keep_cached'
  }
  if (alreadyNotified) {
    return 'silent'
  }
  return 'notify'
}
