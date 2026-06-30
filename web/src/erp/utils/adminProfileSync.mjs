import { isAdminSessionUnavailableCode } from '../../common/consts/errorCodes.js'

const EFFECTIVE_SESSION_SYNC_FAILED_SOURCE = 'effective_session_sync_failed'
const SYSTEM_DIAGNOSTIC_PAGE_KEYS = new Set([
  'permission-center',
  'system-audit-logs',
])

function isLocalDevRuntime() {
  return import.meta?.env?.DEV === true
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
    return { allowed: true, reason: 'legacy_without_effective_session_pages' }
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
  if (
    isSuperAdmin &&
    session?.source === EFFECTIVE_SESSION_SYNC_FAILED_SOURCE
  ) {
    return { allowed: true, reason: 'super_admin_sync_failed_diagnostic' }
  }
  if (isSuperAdmin && SYSTEM_DIAGNOSTIC_PAGE_KEYS.has(normalizedPageKey)) {
    return { allowed: true, reason: 'super_admin_system_diagnostic' }
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
  isLocalDev = isLocalDevRuntime(),
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
              isLocalDev,
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
} = {}) {
  if (profileLoading) {
    return false
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
  if (!session || typeof session !== 'object') {
    return true
  }
  const { actions } = session
  if (!Array.isArray(actions)) {
    return true
  }
  return actions.includes(normalizedActionKey)
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
  const policy = getEffectiveFieldPolicy(adminProfile, surfaceKey, fieldKey)
  if (!policy || !Object.prototype.hasOwnProperty.call(policy, 'visible')) {
    return true
  }
  return policy.visible !== false
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
