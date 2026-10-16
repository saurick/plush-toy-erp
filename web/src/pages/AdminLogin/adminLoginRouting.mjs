import {
  ENTRY_TARGET,
  getEnabledMobileRoleKeys,
  hasDesktopEntryAccess,
  isMobileRoleEntryEnabled,
  rememberEntryChoice,
  resolveAllowedMobileEntryPath,
  resolveMobileTasksPath,
} from '../../erp/config/entryConfig.mjs'
import {
  getAllowedMobileRoleKeys,
  hasMobileRolePermission,
} from '../../erp/utils/mobileRolePermissions.mjs'

export function resolveAdminPostLoginPath({
  adminProfile,
  entryTarget,
  entryConfig,
  redirectTo = '',
  defaultRedirect = '/erp/dashboard',
  fromMobileRoleKey = '',
  fixedMobileRoleKey = '',
  shouldRemember = true,
  rememberChoice = rememberEntryChoice,
} = {}) {
  if (!adminProfile) {
    return ''
  }

  const enabledRoleKeys = getEnabledMobileRoleKeys(entryConfig)
  const allowedRoleKeys = getAllowedMobileRoleKeys(
    adminProfile,
    enabledRoleKeys
  )

  if (fromMobileRoleKey && entryTarget === ENTRY_TARGET.MOBILE_TASKS) {
    if (
      isMobileRoleEntryEnabled(fromMobileRoleKey, entryConfig) &&
      hasMobileRolePermission(adminProfile, fromMobileRoleKey)
    ) {
      if (shouldRemember) {
        rememberChoice(ENTRY_TARGET.MOBILE_TASKS)
      }
      return redirectTo
    }
    return allowedRoleKeys.length > 0
      ? '/entry?reason=mobile-role-unavailable'
      : '/entry?reason=mobile-role-unassigned'
  }

  if (entryTarget === ENTRY_TARGET.DESKTOP) {
    if (hasDesktopEntryAccess(adminProfile, entryConfig)) {
      if (shouldRemember) {
        rememberChoice(ENTRY_TARGET.DESKTOP)
      }
      return redirectTo.startsWith('/erp/') ? redirectTo : defaultRedirect
    }
    return '/entry'
  }

  if (entryTarget === ENTRY_TARGET.MOBILE_TASKS) {
    const requestedRoleKey = fixedMobileRoleKey
    if (
      requestedRoleKey &&
      allowedRoleKeys.includes(requestedRoleKey) &&
      isMobileRoleEntryEnabled(requestedRoleKey, entryConfig)
    ) {
      if (shouldRemember) {
        rememberChoice(ENTRY_TARGET.MOBILE_TASKS)
      }
      return resolveMobileTasksPath(requestedRoleKey)
    }
    const mobileEntryPath = resolveAllowedMobileEntryPath(allowedRoleKeys)
    if (mobileEntryPath) {
      if (shouldRemember) {
        rememberChoice(ENTRY_TARGET.MOBILE_TASKS)
      }
      return mobileEntryPath
    }
    return '/entry?reason=mobile-role-unassigned'
  }

  return '/entry'
}
