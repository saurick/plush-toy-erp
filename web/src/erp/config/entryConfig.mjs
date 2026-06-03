import { appDefinitions } from './appRegistry.mjs'
import { normalizeRoleKey } from '../utils/roleKeys.mjs'

export const ENTRY_TARGET = Object.freeze({
  DESKTOP: 'desktop',
  MOBILE_TASKS: 'mobileTasks',
})

const LAST_ENTRY_TARGET_KEY = 'erp:last_entry_target'
const LAST_USED = 'lastUsed'

const allMobileRoleKeys = appDefinitions
  .filter((app) => app.kind === 'mobile' && app.roleKey)
  .map((app) => app.roleKey)

const defaultMobileRoleConfig = Object.freeze(
  Object.fromEntries(allMobileRoleKeys.map((roleKey) => [roleKey, true]))
)

const defaultEntryConfig = Object.freeze({
  desktop: true,
  mobileTasks: true,
  rememberLastEntry: true,
  defaultByDevice: {
    phone: ENTRY_TARGET.MOBILE_TASKS,
    desktop: ENTRY_TARGET.DESKTOP,
    tablet: LAST_USED,
  },
  mobileRoles: defaultMobileRoleConfig,
})

function readRuntimeEntryConfig() {
  if (typeof window === 'undefined') {
    return {}
  }
  const runtimeConfig = window.__PLUSH_ERP_ENTRY_CONFIG__
  return runtimeConfig && typeof runtimeConfig === 'object' ? runtimeConfig : {}
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeMobileRoles(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  return Object.fromEntries(
    allMobileRoleKeys.map((roleKey) => [
      roleKey,
      normalizeBoolean(source[roleKey], defaultMobileRoleConfig[roleKey]),
    ])
  )
}

export function getEntryConfig() {
  const runtimeConfig = readRuntimeEntryConfig()
  const defaultByDevice =
    runtimeConfig.defaultByDevice &&
    typeof runtimeConfig.defaultByDevice === 'object'
      ? runtimeConfig.defaultByDevice
      : {}

  return {
    desktop: normalizeBoolean(
      runtimeConfig.desktop,
      defaultEntryConfig.desktop
    ),
    mobileTasks: normalizeBoolean(
      runtimeConfig.mobileTasks,
      defaultEntryConfig.mobileTasks
    ),
    rememberLastEntry: normalizeBoolean(
      runtimeConfig.rememberLastEntry,
      defaultEntryConfig.rememberLastEntry
    ),
    defaultByDevice: {
      ...defaultEntryConfig.defaultByDevice,
      ...defaultByDevice,
    },
    mobileRoles: normalizeMobileRoles(runtimeConfig.mobileRoles),
  }
}

export function normalizeEntryTarget(target = '') {
  const normalized = String(target || '').trim()
  return Object.values(ENTRY_TARGET).includes(normalized) ? normalized : ''
}

export function isDesktopEntryEnabled(config = getEntryConfig()) {
  return config?.desktop === true
}

export function hasDesktopEntryAccess(adminProfile) {
  if (!adminProfile) {
    return false
  }
  if (adminProfile.is_super_admin === true) {
    return true
  }
  return Array.isArray(adminProfile.menus) && adminProfile.menus.length > 0
}

export function isMobileTasksEntryEnabled(config = getEntryConfig()) {
  return config?.mobileTasks === true
}

export function isMobileRoleEntryEnabled(roleKey, config = getEntryConfig()) {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  return Boolean(
    isMobileTasksEntryEnabled(config) &&
      normalizedRoleKey &&
      config?.mobileRoles?.[normalizedRoleKey] === true
  )
}

export function getEnabledMobileRoleKeys(config = getEntryConfig()) {
  if (!isMobileTasksEntryEnabled(config)) {
    return []
  }
  return allMobileRoleKeys.filter(
    (roleKey) => config?.mobileRoles?.[roleKey] === true
  )
}

export function parseMobileRoleFromPath(pathname = '') {
  const match = String(pathname || '').match(/^\/m\/([^/?#]+)/)
  return match ? normalizeRoleKey(decodeURIComponent(match[1])) : ''
}

export function resolveMobileTasksPath(roleKey = '') {
  const normalizedRoleKey = normalizeRoleKey(roleKey)
  return normalizedRoleKey ? `/m/${normalizedRoleKey}/tasks` : ''
}

export function detectEntryDeviceType({ userAgent, maxTouchPoints } = {}) {
  const ua =
    userAgent ||
    (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '')
  let touchPoints = 0
  if (typeof maxTouchPoints === 'number') {
    touchPoints = maxTouchPoints
  } else if (typeof navigator !== 'undefined') {
    touchPoints = navigator.maxTouchPoints || 0
  }

  if (/ipad|tablet|playbook|silk/i.test(ua)) {
    return 'tablet'
  }
  if (/android/i.test(ua) && !/mobile/i.test(ua)) {
    return 'tablet'
  }
  if (/macintosh/i.test(ua) && touchPoints > 1) {
    return 'tablet'
  }
  if (/iphone|ipod|windows phone|mobile/i.test(ua)) {
    return 'phone'
  }
  return 'desktop'
}

function storageGet(key) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return ''
  }
  return window.localStorage.getItem(key) || ''
}

function storageSet(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  if (value) {
    window.localStorage.setItem(key, value)
  } else {
    window.localStorage.removeItem(key)
  }
}

export function getLastEntryTarget() {
  return normalizeEntryTarget(storageGet(LAST_ENTRY_TARGET_KEY))
}

export function rememberEntryChoice(target) {
  const normalizedTarget = normalizeEntryTarget(target)
  if (!normalizedTarget) {
    return
  }
  storageSet(LAST_ENTRY_TARGET_KEY, normalizedTarget)
}

export function resolveDefaultEntryTarget({
  pathname = '',
  config = getEntryConfig(),
  lastTarget = getLastEntryTarget(),
  deviceType = detectEntryDeviceType(),
} = {}) {
  if (parseMobileRoleFromPath(pathname)) {
    return isMobileTasksEntryEnabled(config) ? ENTRY_TARGET.MOBILE_TASKS : ''
  }
  if (String(pathname || '').startsWith('/erp')) {
    return isDesktopEntryEnabled(config) ? ENTRY_TARGET.DESKTOP : ''
  }

  const configuredDefault = config?.defaultByDevice?.[deviceType] || ''
  if (configuredDefault === LAST_USED) {
    if (
      config.rememberLastEntry &&
      normalizeEntryTarget(lastTarget) &&
      ((lastTarget === ENTRY_TARGET.DESKTOP && isDesktopEntryEnabled(config)) ||
        (lastTarget === ENTRY_TARGET.MOBILE_TASKS &&
          isMobileTasksEntryEnabled(config)))
    ) {
      return lastTarget
    }
    return ''
  }

  const normalizedDefault = normalizeEntryTarget(configuredDefault)
  if (
    normalizedDefault === ENTRY_TARGET.DESKTOP &&
    isDesktopEntryEnabled(config)
  ) {
    return normalizedDefault
  }
  if (
    normalizedDefault === ENTRY_TARGET.MOBILE_TASKS &&
    isMobileTasksEntryEnabled(config)
  ) {
    return normalizedDefault
  }
  return ''
}
