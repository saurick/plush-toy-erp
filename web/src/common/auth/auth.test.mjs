import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'

import { AUTH_SCOPE, getStoredAdminProfile, persistAuth } from './auth.js'

function createStorage() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

function installStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: createStorage(),
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: createStorage(),
  })
}

function createMockAdminToken(username) {
  const header = { alg: 'none', typ: 'JWT' }
  const payload = {
    uid: 1,
    uname: username,
    role: 1,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.signature`
}

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
