import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LOGIN_MODE,
  clearSMSLoginSession,
  normalizeLoginMode,
  normalizeSMSLoginSession,
  readLoginModePreference,
  readSMSLoginSession,
  rememberLoginModePreference,
  rememberSMSLoginSession,
} from './adminLoginState.mjs'

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
  }
}

test('readable storage with failed writes and removals uses current memory values', () => {
  const localStorage = createStorage()
  const sessionStorage = createStorage()
  localStorage.setItem('erp:admin_login_mode', 'password')
  sessionStorage.setItem(
    'erp:admin_login_sms_state',
    JSON.stringify({ phone: 'old', cooldownUntil: 60000 })
  )
  globalThis.window = { localStorage, sessionStorage }
  const writeLocal = localStorage.setItem
  const writeSession = sessionStorage.setItem
  const removeSession = sessionStorage.removeItem
  localStorage.setItem = () => {
    throw new Error('quota')
  }
  sessionStorage.setItem = () => {
    throw new Error('quota')
  }
  sessionStorage.removeItem = () => {
    throw new Error('quota')
  }
  rememberLoginModePreference('sms')
  assert.equal(readLoginModePreference(), 'sms')
  rememberSMSLoginSession({ phone: 'new', cooldownUntil: 90000 }, 1000)
  assert.equal(readSMSLoginSession(2000).phone, 'new')
  clearSMSLoginSession()
  assert.equal(readSMSLoginSession(2000).phone, '')
  localStorage.setItem = writeLocal
  sessionStorage.setItem = writeSession
  sessionStorage.removeItem = removeSession
  rememberLoginModePreference('password')
  clearSMSLoginSession()
  delete globalThis.window
})

function installWindowStorage() {
  const localStorage = createStorage()
  const sessionStorage = createStorage()
  globalThis.window = {
    localStorage,
    sessionStorage,
  }
  return { localStorage, sessionStorage }
}

test('adminLoginState: 登录方式偏好只接受 password 和 sms', () => {
  assert.equal(normalizeLoginMode('sms'), LOGIN_MODE.SMS)
  assert.equal(normalizeLoginMode('password'), LOGIN_MODE.PASSWORD)
  assert.equal(normalizeLoginMode('unknown'), LOGIN_MODE.PASSWORD)
})

test('adminLoginState: 登录方式偏好刷新后可恢复', () => {
  installWindowStorage()

  rememberLoginModePreference(LOGIN_MODE.SMS)
  assert.equal(readLoginModePreference(), LOGIN_MODE.SMS)

  rememberLoginModePreference('bad-value')
  assert.equal(readLoginModePreference(), LOGIN_MODE.PASSWORD)

  delete globalThis.window
})

test('adminLoginState: 短信倒计时未过期时跨刷新恢复', () => {
  const { sessionStorage } = installWindowStorage()
  const now = 1_000

  rememberSMSLoginSession(
    {
      phone: ' 13794566255 ',
      cooldownUntil: 61_000,
      hint: '验证码已发送，请查看手机短信',
      mockDelivery: true,
    },
    now
  )

  assert.deepEqual(readSMSLoginSession(now + 10_000), {
    phone: '13794566255',
    cooldownUntil: 61_000,
    hint: '验证码已发送，请查看手机短信',
    mockDelivery: true,
  })
  assert.equal(
    sessionStorage.getItem('erp:admin_login_sms_state') !== null,
    true
  )

  delete globalThis.window
})

test('adminLoginState: 过期或损坏的短信倒计时不会恢复', () => {
  const { sessionStorage } = installWindowStorage()

  assert.deepEqual(
    normalizeSMSLoginSession(
      {
        phone: '13794566255',
        cooldownUntil: 900,
        hint: '验证码已发送，请查看手机短信',
        mockDelivery: true,
      },
      1_000
    ),
    {
      phone: '',
      cooldownUntil: 0,
      hint: '',
    }
  )

  sessionStorage.setItem('erp:admin_login_sms_state', '{bad json')
  assert.deepEqual(readSMSLoginSession(1_000), {
    phone: '',
    cooldownUntil: 0,
    hint: '',
  })
  assert.equal(sessionStorage.getItem('erp:admin_login_sms_state'), null)

  rememberSMSLoginSession({ cooldownUntil: 0 }, 1_000)
  assert.equal(sessionStorage.getItem('erp:admin_login_sms_state'), null)

  clearSMSLoginSession()
  assert.equal(sessionStorage.getItem('erp:admin_login_sms_state'), null)

  delete globalThis.window
})

test('adminLoginState: 未声明 mockDelivery 的旧短信会话按非 mock 处理', () => {
  const now = 1_000

  assert.deepEqual(
    normalizeSMSLoginSession(
      {
        phone: '13794566255',
        cooldownUntil: 61_000,
        hint: '验证码已发送，请查看手机短信',
      },
      now
    ),
    {
      phone: '13794566255',
      cooldownUntil: 61_000,
      hint: '验证码已发送，请查看手机短信',
      mockDelivery: false,
    }
  )
})
