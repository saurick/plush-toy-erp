function normalizeStringList(values = []) {
  return Array.isArray(values)
    ? values.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

export function isMenuVisibleForPermissionKeys(menu = {}, permissionKeys = []) {
  const permissionSet = new Set(normalizeStringList(permissionKeys))
  const requiredAny = normalizeStringList(menu?.required_any)
  const requiredAll = normalizeStringList(menu?.required_all)
  const hasAny =
    requiredAny.length === 0 ||
    requiredAny.some((permissionKey) =>
      permissionSet.has(permissionKey)
    )
  const hasAll = requiredAll.every((permissionKey) =>
    permissionSet.has(permissionKey)
  )
  return hasAny && hasAll
}
