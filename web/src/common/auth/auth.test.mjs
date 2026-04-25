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

test('auth: 缺失 admin_level 不会被误判成超级管理员', () => {
  installStorage()

  persistAuth(
    {
      access_token: createMockAdminToken('legacy-admin'),
      username: 'legacy-admin',
      menu_permissions: ['/erp/dashboard'],
    },
    AUTH_SCOPE.ADMIN
  )

  const profile = getStoredAdminProfile()
  assert.equal(profile.level, null)
})

test('auth: 显式 admin_level=0 仍保留超级管理员等级', () => {
  installStorage()

  persistAuth(
    {
      access_token: createMockAdminToken('root'),
      username: 'root',
      admin_level: 0,
      mobile_role_permissions: ['boss'],
    },
    AUTH_SCOPE.ADMIN
  )

  const profile = getStoredAdminProfile()
  assert.equal(profile.level, 0)
  assert.deepEqual(profile.mobile_role_permissions, ['boss'])
})
