import { resolveMenuPermissionKey } from '../config/menuPermissions.mjs'

function menuPathOf(menu) {
  return typeof menu === 'string' ? menu : menu?.path
}

function pathnameOf(entryPath) {
  return String(entryPath || '')
    .trim()
    .split(/[?#]/u, 1)[0]
}

export function canOpenWorkflowTaskEntry(adminProfile = {}, entryPath = '') {
  const requiredMenuPath = resolveMenuPermissionKey(pathnameOf(entryPath))
  if (!requiredMenuPath) return false
  if (adminProfile?.is_super_admin === true) return true

  return (Array.isArray(adminProfile?.menus) ? adminProfile.menus : []).some(
    (menu) => resolveMenuPermissionKey(menuPathOf(menu)) === requiredMenuPath
  )
}
