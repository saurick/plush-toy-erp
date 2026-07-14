import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'

import {
  AUTH_SCOPE,
  getAuthMeta,
  getCurrentUser,
  getStoredAdminProfile,
  logout,
  persistAuth,
  persistAuthMeta,
} from './auth.js'

function createStorage({
  rejectGetItemKeys = new Set(),
  rejectSetItemKeys = new Set(),
  rejectRemoveItemKeys = new Set(),
} = {}) {
  const store = new Map()
  return {
    getItem(key) {
      if (rejectGetItemKeys.has(key)) {
        throw new DOMException('access denied', 'SecurityError')
      }
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      if (rejectSetItemKeys.has(key)) {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      store.set(key, String(value))
    },
    removeItem(key) {
      if (rejectRemoveItemKeys.has(key)) {
        throw new DOMException('access denied', 'SecurityError')
      }
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

function installStorage(options) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: createStorage(options),
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: createStorage(),
  })
}

function createMockAdminToken(username) {
  const header = { alg: 'none', typ: 'JWT' }
  const issuedAt = Math.floor(Date.now() / 1000)
  const sessionKey = `session-${username}`
  const payload = {
    uid: 1,
    sid: sessionKey,
    auth_version: 1,
    iss: 'plush-toy-erp',
    aud: ['plush-toy-erp-admin'],
    sub: 'admin_access_token',
    jti: sessionKey,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.signature`
}

test('auth: 新版 session token 不依赖已移除的 uname 与 role claim', () => {
  installStorage()

  persistAuth(
    {
      access_token: createMockAdminToken('root'),
      username: 'root',
      is_super_admin: true,
    },
    AUTH_SCOPE.ADMIN
  )

  const currentUser = getCurrentUser(AUTH_SCOPE.ADMIN)
  assert.equal(currentUser?.id, 1)
  assert.equal(currentUser?.username, 'root')
  assert.equal(currentUser?.role, 'admin')
  assert(currentUser?.exp > Math.floor(Date.now() / 1000))
  assert.equal(getStoredAdminProfile().role, 'admin')
})

test('auth: 旧 uname/role token 不会被当作新版管理员 session', () => {
  installStorage()
  const issuedAt = Math.floor(Date.now() / 1000)
  const token = `${base64UrlEncode({ alg: 'none', typ: 'JWT' })}.${base64UrlEncode(
    {
      uid: 1,
      uname: 'legacy-admin',
      role: 1,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }
  )}.signature`

  persistAuth({ access_token: token, username: 'legacy-admin' })

  assert.equal(getCurrentUser(AUTH_SCOPE.ADMIN), null)
  assert.equal(localStorage.getItem('admin_access_token'), null)
})

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

test('auth: 缺失 is_super_admin 不会被误判成超级管理员', () => {
  installStorage()

  persistAuth(
    {
      access_token: createMockAdminToken('legacy-admin'),
      username: 'legacy-admin',
      permissions: ['erp.dashboard.read'],
    },
    AUTH_SCOPE.ADMIN
  )

  const profile = getStoredAdminProfile()
  assert.equal(profile.is_super_admin, false)
  assert.deepEqual(profile.permissions, ['erp.dashboard.read'])
})

test('auth: 显式 is_super_admin=true 仍保留超级管理员身份和 RBAC 元数据', () => {
  installStorage()

  persistAuth(
    {
      access_token: createMockAdminToken('root'),
      username: 'root',
      is_super_admin: true,
      roles: [{ role_key: 'admin', name: '系统管理员' }],
      permissions: ['system.user.read'],
      menus: [{ path: '/erp/system/permissions', label: '权限管理' }],
    },
    AUTH_SCOPE.ADMIN
  )

  const profile = getStoredAdminProfile()
  assert.equal(profile.is_super_admin, true)
  assert.deepEqual(profile.roles, [{ role_key: 'admin', name: '系统管理员' }])
  assert.deepEqual(profile.permissions, ['system.user.read'])
  assert.deepEqual(profile.menus, [
    { path: '/erp/system/permissions', label: '权限管理' },
  ])
})

test('auth: 管理员元数据本地缓存满额时不阻断 profile 同步', () => {
  installStorage({
    rejectSetItemKeys: new Set(['admin_menus']),
  })

  assert.doesNotThrow(() => {
    persistAuthMeta(
      {
        user_id: 1,
        username: 'root',
        is_super_admin: true,
        roles: [{ role_key: 'admin', name: '系统管理员' }],
        permissions: ['system.user.read'],
        menus: [{ path: '/erp/system/permissions', label: '权限管理' }],
        erp_preferences: { column_orders: {} },
      },
      AUTH_SCOPE.ADMIN
    )
  })

  assert.equal(getAuthMeta(AUTH_SCOPE.ADMIN, 'username'), 'root')
  assert.deepEqual(getAuthMeta(AUTH_SCOPE.ADMIN, 'menus'), null)
  assert.deepEqual(getAuthMeta(AUTH_SCOPE.ADMIN, 'permissions'), [
    'system.user.read',
  ])
})

test('auth: logout 只清理当前 scope 认证信息，不清空项目其他 localStorage', () => {
  installStorage()

  persistAuth(
    {
      access_token: createMockAdminToken('root'),
      username: 'root',
      permissions: ['system.user.read'],
      menus: [{ path: '/erp/system/permissions', label: '权限管理' }],
    },
    AUTH_SCOPE.ADMIN
  )
  localStorage.setItem('plush_erp_theme_mode', 'dark')
  localStorage.setItem('erp:last_entry_target', 'desktop')

  logout(AUTH_SCOPE.ADMIN)

  assert.equal(localStorage.getItem('admin_access_token'), null)
  assert.equal(localStorage.getItem('admin_username'), null)
  assert.equal(localStorage.getItem('admin_permissions'), null)
  assert.equal(localStorage.getItem('plush_erp_theme_mode'), 'dark')
  assert.equal(localStorage.getItem('erp:last_entry_target'), 'desktop')
})

test('auth: 浏览器拒绝 storage 读取时按未登录处理且不抛异常', () => {
  installStorage({
    rejectGetItemKeys: new Set(['admin_access_token', 'admin_permissions']),
    rejectRemoveItemKeys: new Set(['admin_access_token']),
  })

  assert.equal(getStoredAdminProfile(), null)
  assert.equal(getAuthMeta(AUTH_SCOPE.ADMIN, 'permissions'), null)
  assert.doesNotThrow(() => logout(AUTH_SCOPE.ADMIN))
})
