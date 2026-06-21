export const LOGIN_MODE = Object.freeze({
  PASSWORD: 'password',
  SMS: 'sms',
})

const LOGIN_MODE_STORAGE_KEY = 'erp:admin_login_mode'
const SMS_LOGIN_SESSION_KEY = 'erp:admin_login_sms_state'

function safeStorage(type) {
  if (typeof window === 'undefined') return null
  try {
    return type === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

export function normalizeLoginMode(value) {
  return value === LOGIN_MODE.SMS ? LOGIN_MODE.SMS : LOGIN_MODE.PASSWORD
}

export function readLoginModePreference() {
  const storage = safeStorage('local')
  if (!storage) return LOGIN_MODE.PASSWORD
  return normalizeLoginMode(storage.getItem(LOGIN_MODE_STORAGE_KEY))
}

export function rememberLoginModePreference(value) {
  const storage = safeStorage('local')
  if (!storage) return
  storage.setItem(LOGIN_MODE_STORAGE_KEY, normalizeLoginMode(value))
}

export function normalizeSMSLoginSession(input, now = Date.now()) {
  const source = input && typeof input === 'object' ? input : {}
  const cooldownUntil = Number(source.cooldownUntil || 0)
  if (!Number.isFinite(cooldownUntil) || cooldownUntil <= now) {
    return {
      phone: '',
      cooldownUntil: 0,
      hint: '',
    }
  }
  return {
    phone: String(source.phone || '').trim(),
    cooldownUntil,
    hint: String(source.hint || '').trim(),
  }
}

export function readSMSLoginSession(now = Date.now()) {
  const storage = safeStorage('session')
  if (!storage) {
    return normalizeSMSLoginSession(null, now)
  }
  try {
    return normalizeSMSLoginSession(
      JSON.parse(storage.getItem(SMS_LOGIN_SESSION_KEY) || 'null'),
      now
    )
  } catch {
    storage.removeItem(SMS_LOGIN_SESSION_KEY)
    return normalizeSMSLoginSession(null, now)
  }
}

export function rememberSMSLoginSession(session, now = Date.now()) {
  const storage = safeStorage('session')
  if (!storage) return
  const normalized = normalizeSMSLoginSession(session, now)
  if (!normalized.cooldownUntil) {
    storage.removeItem(SMS_LOGIN_SESSION_KEY)
    return
  }
  storage.setItem(SMS_LOGIN_SESSION_KEY, JSON.stringify(normalized))
}

export function clearSMSLoginSession() {
  const storage = safeStorage('session')
  if (!storage) return
  storage.removeItem(SMS_LOGIN_SESSION_KEY)
}
