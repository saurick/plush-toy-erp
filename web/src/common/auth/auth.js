import { jwtDecode } from 'jwt-decode'

export const AUTH_SCOPE = {
  USER: 'user',
  ADMIN: 'admin',
}

const LEGACY_TOKEN_KEY = 'access_token'
const TOKEN_KEYS = {
  [AUTH_SCOPE.USER]: 'user_access_token',
  [AUTH_SCOPE.ADMIN]: 'admin_access_token',
}
const META_KEYS = [
  'expires_at',
  'token_type',
  'user_id',
  'username',
  'phone',
  'is_super_admin',
  'roles',
  'permissions',
  'menus',
  'erp_preferences',
]

// 仅用于清理旧登录态残留；RBAC 权限恢复只读取 roles / permissions / menus。
const LEGACY_META_KEYS = [
  'admin_level',
  'menu_permissions',
  'mobile_role_permissions',
]
const JSON_META_KEYS = new Set([
  'roles',
  'permissions',
  'menus',
  'erp_preferences',
])

function normalizeScope(scope = AUTH_SCOPE.USER) {
  return scope === AUTH_SCOPE.ADMIN ? AUTH_SCOPE.ADMIN : AUTH_SCOPE.USER
}

function getScopedMetaKey(scope, key) {
  return `${scope}_${key}`
}

function migrateLegacyUserToken() {
  const userKey = TOKEN_KEYS[AUTH_SCOPE.USER]
  const current = localStorage.getItem(userKey)
  if (current) return current

  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY)
  if (!legacy) return ''

  localStorage.setItem(userKey, legacy)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  return legacy
}

export function getToken(scope = AUTH_SCOPE.USER) {
  const normalizedScope = normalizeScope(scope)
  const key = TOKEN_KEYS[normalizedScope]
  const token = localStorage.getItem(key)
  if (token) return token

  // 兼容历史单 token 存储
  if (normalizedScope === AUTH_SCOPE.USER) {
    return migrateLegacyUserToken()
  }
  return ''
}

export function setToken(token, scope = AUTH_SCOPE.USER) {
  const normalizedScope = normalizeScope(scope)
  localStorage.setItem(TOKEN_KEYS[normalizedScope], token)
  if (normalizedScope === AUTH_SCOPE.USER) {
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  }
}

function setScopedMeta(scope, data) {
  META_KEYS.forEach((key) => {
    const value = data?.[key]
    if (value != null && value !== '') {
      const serialized = JSON_META_KEYS.has(key)
        ? JSON.stringify(value)
        : String(value)
      localStorage.setItem(getScopedMetaKey(scope, key), serialized)
    } else {
      localStorage.removeItem(getScopedMetaKey(scope, key))
    }
  })
  LEGACY_META_KEYS.forEach((key) => {
    localStorage.removeItem(getScopedMetaKey(scope, key))
  })
}

function clearScopedMeta(scope) {
  const keys = [...META_KEYS, ...LEGACY_META_KEYS]
  keys.forEach((key) => {
    localStorage.removeItem(getScopedMetaKey(scope, key))
  })
}

export function persistAuth(data, scope = AUTH_SCOPE.USER) {
  const token = data?.access_token
  if (!token) throw new Error('missing access_token')

  const normalizedScope = normalizeScope(scope)
  setToken(String(token), normalizedScope)
  setScopedMeta(normalizedScope, data || {})
}

export function persistAuthMeta(data, scope = AUTH_SCOPE.USER) {
  setScopedMeta(normalizeScope(scope), data || {})
}

export function getAuthMeta(scope, key) {
  const normalizedScope = normalizeScope(scope)
  const raw = localStorage.getItem(getScopedMetaKey(normalizedScope, key))
  if (raw == null || raw === '') {
    return null
  }
  if (JSON_META_KEYS.has(key)) {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return raw
}

export function getLoginPath(scope = AUTH_SCOPE.USER) {
  return normalizeScope(scope) === AUTH_SCOPE.ADMIN ? '/admin-login' : '/login'
}

export function logout(scope = AUTH_SCOPE.USER) {
  const normalizedScope = normalizeScope(scope)
  localStorage.removeItem(TOKEN_KEYS[normalizedScope])
  clearScopedMeta(normalizedScope)
  if (normalizedScope === AUTH_SCOPE.USER) {
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  }

  try {
    sessionStorage.clear()
  } catch (e) {
    console.warn('清空 sessionStorage 失败', e)
  }
}

function isExpired(claims) {
  if (!claims?.exp) return true
  return claims.exp * 1000 <= Date.now()
}

export function getCurrentUser(scope = AUTH_SCOPE.USER) {
  const normalizedScope = normalizeScope(scope)
  const token = getToken(normalizedScope)
  if (!token) return null
  try {
    const claims = jwtDecode(token)
    if (isExpired(claims)) {
      logout(normalizedScope)
      return null
    }
    return {
      id: claims.uid,
      username: claims.uname,
      role: Number(claims.role) === 1 ? 'admin' : 'user',
      exp: claims.exp, // 秒级时间戳
    }
  } catch {
    logout(normalizedScope)
    return null
  }
}

export function getStoredAdminProfile() {
  const admin = getCurrentUser(AUTH_SCOPE.ADMIN)
  if (!admin) {
    return null
  }

  const isSuperAdminMeta = getAuthMeta(AUTH_SCOPE.ADMIN, 'is_super_admin')
  const roles = getAuthMeta(AUTH_SCOPE.ADMIN, 'roles')
  const permissions = getAuthMeta(AUTH_SCOPE.ADMIN, 'permissions')
  const menus = getAuthMeta(AUTH_SCOPE.ADMIN, 'menus')
  const erpPreferences = getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences')

  return {
    ...admin,
    is_super_admin:
      isSuperAdminMeta === true || String(isSuperAdminMeta) === 'true',
    roles: Array.isArray(roles) ? roles : [],
    permissions: Array.isArray(permissions) ? permissions : [],
    menus: Array.isArray(menus) ? menus : [],
    erp_preferences:
      erpPreferences && typeof erpPreferences === 'object'
        ? erpPreferences
        : { column_orders: {} },
  }
}

export function isLoggedIn(scope = AUTH_SCOPE.USER) {
  return !!getCurrentUser(scope)
}
