import { jwtDecode } from 'jwt-decode'
import { isValidAdminSessionClaims } from './adminTokenContract.mjs'
import { clearRetiredPrintWindowState } from './printWindowStorageCleanup.mjs'

export const AUTH_SESSION_CHANGED_EVENT = 'plush:auth-session-changed'
export const AUTH_META_CHANGED_EVENT = 'plush:auth-meta-changed'

function notifyMetaChanged() {
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function'
  ) {
    window.dispatchEvent(new Event(AUTH_META_CHANGED_EVENT))
  }
}

function notifySessionChanged() {
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function'
  ) {
    window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT))
  }
}

export const AUTH_SCOPE = {
  ADMIN: 'admin',
}

const TOKEN_KEYS = {
  [AUTH_SCOPE.ADMIN]: 'admin_access_token',
}
const META_KEYS = [
  'expires_at',
  'token_type',
  'user_id',
  'username',
  'display_name',
  'phone',
  'is_super_admin',
  'roles',
  'permissions',
  'menus',
  'erp_preferences',
]

const JSON_META_KEYS = new Set([
  'roles',
  'permissions',
  'menus',
  'erp_preferences',
])

function normalizeScope(_scope = AUTH_SCOPE.ADMIN) {
  return AUTH_SCOPE.ADMIN
}

function getScopedMetaKey(scope, key) {
  return `${scope}_${key}`
}

function setStorageItem(storage, key, value) {
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function removeStorageItem(storage, key) {
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function getToken(scope = AUTH_SCOPE.ADMIN) {
  const normalizedScope = normalizeScope(scope)
  const key = TOKEN_KEYS[normalizedScope]
  let token = ''
  try {
    token = localStorage.getItem(key)
  } catch {
    return ''
  }
  if (token) return token
  return ''
}

export function setToken(token, scope = AUTH_SCOPE.ADMIN) {
  const normalizedScope = normalizeScope(scope)
  setStorageItem(localStorage, TOKEN_KEYS[normalizedScope], token)
  clearRetiredPrintWindowState()
  notifySessionChanged()
}

function setScopedMeta(scope, data) {
  META_KEYS.forEach((key) => {
    const value = data?.[key]
    const storageKey = getScopedMetaKey(scope, key)
    if (value != null && value !== '') {
      const serialized = JSON_META_KEYS.has(key)
        ? JSON.stringify(value)
        : String(value)
      setStorageItem(localStorage, storageKey, serialized)
    } else {
      removeStorageItem(localStorage, storageKey)
    }
  })
}

function clearScopedMeta(scope) {
  META_KEYS.forEach((key) => {
    removeStorageItem(localStorage, getScopedMetaKey(scope, key))
  })
}

export function persistAuth(data, scope = AUTH_SCOPE.ADMIN) {
  const token = data?.access_token
  if (!token) throw new Error('missing access_token')

  const normalizedScope = normalizeScope(scope)
  setToken(String(token), normalizedScope)
  setScopedMeta(normalizedScope, data || {})
  notifyMetaChanged()
}

export function persistAuthMeta(data, scope = AUTH_SCOPE.ADMIN) {
  setScopedMeta(normalizeScope(scope), data || {})
  notifyMetaChanged()
}

export function persistAdminERPPreferences(groups, { token, userID }) {
  if (
    !token ||
    getToken(AUTH_SCOPE.ADMIN) !== token ||
    String(getAuthMeta(AUTH_SCOPE.ADMIN, 'user_id')) !== String(userID)
  ) {
    return null
  }
  const preferences = {
    ...getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences'),
    ...groups,
  }
  setStorageItem(
    localStorage,
    getScopedMetaKey(AUTH_SCOPE.ADMIN, 'erp_preferences'),
    JSON.stringify(preferences)
  )
  notifyMetaChanged()
  return preferences
}

// 保留本次账号读取期间已保存的偏好组，防止较早的 me 响应覆盖新设置。
export function mergeAdminERPPreferencesRead(incoming, before) {
  const current = getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences') || {}
  const preferences = { ...(incoming || {}) }
  for (const key of ['appearance', 'column_orders', 'hidden_columns']) {
    if (JSON.stringify(current[key]) !== JSON.stringify(before?.[key])) {
      preferences[key] = current[key]
    }
  }
  return preferences
}

export function subscribeAdminERPPreferences(listener) {
  const onChange = () => {
    const profile = getStoredAdminProfile()
    if (
      profile &&
      String(getAuthMeta(AUTH_SCOPE.ADMIN, 'user_id')) === String(profile.id)
    ) {
      listener(profile)
    }
  }
  const onStorage = (event) => {
    if (event.key === null || event.key === 'admin_erp_preferences') onChange()
  }
  window.addEventListener(AUTH_META_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(AUTH_META_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function getAuthMeta(scope, key) {
  const normalizedScope = normalizeScope(scope)
  let raw = null
  try {
    raw = localStorage.getItem(getScopedMetaKey(normalizedScope, key))
  } catch {
    return null
  }
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

export function getLoginPath(_scope = AUTH_SCOPE.ADMIN) {
  return '/admin-login'
}

export function logout(scope = AUTH_SCOPE.ADMIN) {
  const normalizedScope = normalizeScope(scope)
  const hadToken = Boolean(getToken(normalizedScope))
  removeStorageItem(localStorage, TOKEN_KEYS[normalizedScope])
  clearScopedMeta(normalizedScope)
  clearRetiredPrintWindowState()
  if (hadToken) notifySessionChanged()

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

export function getCurrentUser(scope = AUTH_SCOPE.ADMIN) {
  const normalizedScope = normalizeScope(scope)
  const token = getToken(normalizedScope)
  if (!token) return null
  try {
    const claims = jwtDecode(token)
    if (!isValidAdminSessionClaims(claims) || isExpired(claims)) {
      logout(normalizedScope)
      return null
    }
    return {
      id: Number(claims.uid),
      username: String(getAuthMeta(normalizedScope, 'username') || ''),
      display_name: String(getAuthMeta(normalizedScope, 'display_name') || ''),
      phone: String(getAuthMeta(normalizedScope, 'phone') || ''),
      // 当前 token 只存在于 admin scope；真正授权仍由后端 session、账号状态与 RBAC 校验。
      role: 'admin',
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
  const displayName = String(
    getAuthMeta(AUTH_SCOPE.ADMIN, 'display_name') || ''
  )
  const phone = String(getAuthMeta(AUTH_SCOPE.ADMIN, 'phone') || '')

  return {
    ...admin,
    display_name: displayName,
    phone,
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

export function isLoggedIn(scope = AUTH_SCOPE.ADMIN) {
  return !!getCurrentUser(scope)
}
