function normalizedText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedDisplayNameKey(value) {
  const displayName = normalizedText(value)
  return displayName
    ? displayName.normalize('NFKC').toLocaleLowerCase('zh-CN')
    : ''
}

export function getAdminDisplayName(admin = {}, fallback = '') {
  return (
    normalizedText(admin?.display_name) ||
    normalizedText(admin?.displayName) ||
    normalizedText(admin?.name) ||
    normalizedText(admin?.username) ||
    normalizedText(fallback)
  )
}

export function formatAdminIdentity(
  admin = {},
  { fallback = '当前账号', includeUsername = true } = {}
) {
  const displayName =
    normalizedText(admin?.display_name) ||
    normalizedText(admin?.displayName) ||
    normalizedText(admin?.name)
  const username = normalizedText(admin?.username)
  if (displayName) {
    return includeUsername && username && username !== displayName
      ? `${displayName}（${username}）`
      : displayName
  }
  return username || normalizedText(fallback)
}

export function formatAdminAccountLabel(admin = {}, fallback = '未记录账号') {
  const username = normalizedText(admin?.username)
  return username ? `账号：${username}` : fallback
}

export function findAdminsWithDisplayName(
  admins = [],
  displayName = '',
  { excludeAdminID = null } = {}
) {
  if (!Array.isArray(admins)) return []

  const displayNameKey = normalizedDisplayNameKey(displayName)
  if (!displayNameKey) return []

  const excludedID = Number(excludeAdminID)
  const hasExcludedID = Number.isInteger(excludedID) && excludedID > 0

  return admins.filter((admin) => {
    const adminID = Number(admin?.id)
    if (hasExcludedID && adminID === excludedID) return false
    return normalizedDisplayNameKey(admin?.display_name) === displayNameKey
  })
}
