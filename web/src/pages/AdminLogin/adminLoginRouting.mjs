import {
  ENTRY_TARGET,
  getEnabledMobileRoleKeys,
  hasDesktopEntryAccess,
  isMobileRoleEntryEnabled,
  rememberEntryChoice,
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
    return ''
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
    const enabledRoleKeys = getEnabledMobileRoleKeys(entryConfig)
    const allowedRoleKeys = getAllowedMobileRoleKeys(
      adminProfile,
      enabledRoleKeys
    )
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
    if (allowedRoleKeys.length === 1) {
      if (shouldRemember) {
        rememberChoice(ENTRY_TARGET.MOBILE_TASKS)
      }
      return resolveMobileTasksPath(allowedRoleKeys[0])
    }
    if (allowedRoleKeys.length > 1) {
      const defaultRoleKey = allowedRoleKeys[0]
      if (shouldRemember) {
        rememberChoice(ENTRY_TARGET.MOBILE_TASKS)
      }
      return resolveMobileTasksPath(defaultRoleKey)
    }
    if (hasDesktopEntryAccess(adminProfile, entryConfig)) {
      return '/entry?target=desktop'
    }
    return ''
  }

  return '/entry'
}
