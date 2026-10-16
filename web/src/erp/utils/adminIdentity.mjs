import { getRoleDisplayName } from './roleKeys.mjs'

function normalizedText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedDisplayNameKey(value) {
  const displayName = normalizedText(value)
  return displayName
    ? displayName.normalize('NFKC').toLocaleLowerCase('zh-CN')
    : ''
}

function getAdminName(admin) {
  return (
    normalizedText(admin?.display_name) ||
    normalizedText(admin?.displayName) ||
    normalizedText(admin?.name)
  )
}

export function getAdminDisplayName(admin = {}, fallback = '') {
  return getAdminName(admin) || normalizedText(admin?.username) || normalizedText(fallback)
}

export function getAdminAccountName(admin = {}) {
  return getAdminName(admin) || (admin?.is_super_admin === true ? '超级管理员' : '姓名待补录')
}

export function formatAdminIdentity(
  admin = {},
  { fallback = '当前账号', includeUsername = true } = {}
) {
  const displayName = getAdminName(admin)
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

const AVATAR_TONES = ['blue', 'green', 'purple', 'orange', 'teal', 'rose', 'indigo', 'brown']

export function getAdminAvatar(admin = {}) {
  const name = getAdminName(admin).normalize('NFKC')
  const characters = name.match(/\p{Script=Han}/gu) || []
  const text = characters.slice(-2).join('') || (admin?.is_super_admin === true ? '管理' : '用户')
  // 颜色绑定账号身份；改姓名、切换岗位或外观偏好不会重新分配颜色。
  const identity = admin?.id != null
    ? String(admin.id)
    : normalizedText(admin?.username)
  let hash = 0
  for (const character of identity) hash = (hash * 31 + character.codePointAt(0)) % 4294967296
  return { text, tone: AVATAR_TONES[hash % AVATAR_TONES.length] }
}

export function getAdminRoleNames(admin = {}) {
  const roles = Array.isArray(admin?.roles) ? admin.roles : []
  const seen = new Set()
  return roles.flatMap((role) => {
    if (!role || role.disabled === true) return []
    const key = normalizedText(role.role_key)
    const name = normalizedText(role.name) || getRoleDisplayName(key)
    if (!name || seen.has(key || name)) return []
    seen.add(key || name)
    return [name]
  })
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
