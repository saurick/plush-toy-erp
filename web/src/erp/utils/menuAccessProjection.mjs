function normalizeStringList(values = []) {
  return Array.isArray(values)
    ? values.map((item) => String(item || '').trim()).filter(Boolean)
    : []
}

export function isMenuVisibleForPermissionKeys(menu = {}, permissionKeys = []) {
  const permissionSet = new Set(normalizeStringList(permissionKeys))
  const legacyRequired = normalizeStringList(menu?.required_permissions)
  const requiredAny = normalizeStringList(menu?.required_any)
  const requiredAll = normalizeStringList(menu?.required_all)
  const usesExplicitRequirementMode =
    Array.isArray(menu?.required_any) || Array.isArray(menu?.required_all)
  const effectiveRequiredAny = usesExplicitRequirementMode
    ? requiredAny
    : legacyRequired
  const hasAny =
    effectiveRequiredAny.length === 0 ||
    effectiveRequiredAny.some((permissionKey) =>
      permissionSet.has(permissionKey)
    )
  const hasAll = requiredAll.every((permissionKey) =>
    permissionSet.has(permissionKey)
  )
  return hasAny && hasAll
}
