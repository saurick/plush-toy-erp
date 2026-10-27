import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AUTH_SCOPE,
  AUTH_SESSION_CHANGED_EVENT,
  AUTH_META_CHANGED_EVENT,
  getAuthMeta,
  getCurrentUser,
  getToken,
  persistAdminERPPreferences,
} from '@/common/auth/auth'
import { setERPAppearance } from '@/erp/api/erpPreferenceApi.mjs'
import {
  ERP_THEME_MODE,
  ERP_THEME_STORAGE_KEY,
  normalizeERPThemeMode,
  resolveEffectiveERPTheme,
} from './erpThemeMode.mjs'
import {
  ERP_ACCENTS,
  ERP_APPEARANCE_STORAGE_KEY,
  normalizeERPAppearance,
  normalizeERPAccountAppearance,
  readERPAppearance,
} from './erpAppearance.mjs'
import { ERP_DARK_PALETTE } from './erpThemePalette.mjs'

export {
  ERP_THEME_MODE,
  ERP_THEME_STORAGE_KEY,
  normalizeERPThemeMode,
  resolveEffectiveERPTheme,
}

const ERPThemeContext = createContext(null)

function getBrowserStorage() {
  try {
    return globalThis.window?.localStorage
  } catch {
    return undefined
  }
}

function getInitialThemeMode() {
  if (typeof window === 'undefined') {
    return ERP_THEME_MODE.SYSTEM
  }
  try {
    return normalizeERPThemeMode(
      getBrowserStorage()?.getItem(ERP_THEME_STORAGE_KEY)
    )
  } catch {
    return ERP_THEME_MODE.SYSTEM
  }
}

function getInitialPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function getAppearanceSession(browserStorageKey) {
  if (browserStorageKey) return null
  const admin = getCurrentUser(AUTH_SCOPE.ADMIN)
  return admin ? { userID: admin.id, token: getToken(AUTH_SCOPE.ADMIN) } : null
}

function sameAppearanceSession(left, right) {
  return left?.userID === right?.userID && left?.token === right?.token
}

function readBrowserAppearance(browserStorageKey) {
  if (browserStorageKey) {
    try {
      return normalizeERPAccountAppearance(
        JSON.parse(getBrowserStorage()?.getItem(browserStorageKey) || '{}')
      )
    } catch {
      return normalizeERPAccountAppearance(null)
    }
  }
  return {
    theme_mode: getInitialThemeMode(),
    ...readERPAppearance(getBrowserStorage()),
  }
}

function cacheGuestAppearance(value) {
  try {
    const storage = getBrowserStorage()
    storage?.setItem(ERP_THEME_STORAGE_KEY, value.theme_mode)
    storage?.setItem(
      ERP_APPEARANCE_STORAGE_KEY,
      JSON.stringify(normalizeERPAppearance(value))
    )
  } catch {
    /* 浏览器无法保存时仍保留当前显示。 */
  }
}

function accountAppearanceStorageKey(userID) {
  return `${ERP_APPEARANCE_STORAGE_KEY}:admin:${userID}`
}

function readSessionAppearance(session, browserStorageKey) {
  if (!session) return readBrowserAppearance(browserStorageKey)
  if (
    String(getAuthMeta(AUTH_SCOPE.ADMIN, 'user_id')) === String(session.userID)
  ) {
    return normalizeERPAccountAppearance(
      getAuthMeta(AUTH_SCOPE.ADMIN, 'erp_preferences')?.appearance
    )
  }
  try {
    return normalizeERPAccountAppearance(
      JSON.parse(
        getBrowserStorage()?.getItem(
          accountAppearanceStorageKey(session.userID)
        ) || '{}'
      )
    )
  } catch {
    return normalizeERPAccountAppearance(null)
  }
}

function cacheAccountAppearance(session, value) {
  try {
    getBrowserStorage()?.setItem(
      accountAppearanceStorageKey(session.userID),
      JSON.stringify(value)
    )
  } catch {
    /* 账号偏好仍以服务器保存结果为准。 */
  }
}

export function ERPThemeProvider({ children, browserStorageKey = '' }) {
  return (
    <ERPThemeState key={browserStorageKey} browserStorageKey={browserStorageKey}>
      {children}
    </ERPThemeState>
  )
}

function ERPThemeState({ children, browserStorageKey }) {
  const [displayPreferences, setDisplayPreferences] = useState(() =>
    readSessionAppearance(
      getAppearanceSession(browserStorageKey),
      browserStorageKey
    )
  )
  const themeMode = displayPreferences.theme_mode
  const appearance = useMemo(
    () => normalizeERPAppearance(displayPreferences),
    [displayPreferences]
  )
  const preferencesRef = useRef(displayPreferences)
  const sessionRef = useRef(getAppearanceSession(browserStorageKey))
  const pendingPatchRef = useRef({})
  const retryPatchRef = useRef({})
  const savingSessionRef = useRef(null)
  const mountedRef = useRef(true)
  const [appearanceSaving, setAppearanceSaving] = useState(false)
  const [appearanceSaveError, setAppearanceSaveError] = useState('')
  const [prefersDark, setPrefersDark] = useState(getInitialPrefersDark)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!window.matchMedia) {
      return undefined
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event) => {
      setPrefersDark(event.matches)
    }

    setPrefersDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    const syncStoredThemeMode = () => {
      const session = getAppearanceSession(browserStorageKey)
      const signedOutAppearance = !session && sessionRef.current
        ? {
            ...readBrowserAppearance(browserStorageKey),
            theme_mode: preferencesRef.current.theme_mode,
            accent: preferencesRef.current.accent,
          }
        : null
      if (signedOutAppearance) cacheGuestAppearance(signedOutAppearance)
      if (!sameAppearanceSession(session, sessionRef.current)) {
        sessionRef.current = session
        pendingPatchRef.current = {}
        retryPatchRef.current = {}
        savingSessionRef.current = null
        setAppearanceSaving(false)
        setAppearanceSaveError('')
      } else if (
        savingSessionRef.current ||
        Object.keys(retryPatchRef.current).length
      ) {
        return
      }
      const next = signedOutAppearance || readSessionAppearance(session, browserStorageKey)
      preferencesRef.current = next
      setDisplayPreferences(next)
      if (session) cacheAccountAppearance(session, next)
    }
    const storageKeys = browserStorageKey
      ? [browserStorageKey]
      : [
          ERP_THEME_STORAGE_KEY,
          ERP_APPEARANCE_STORAGE_KEY,
          'admin_access_token',
          'admin_erp_preferences',
          'admin_user_id',
        ]
    const handleStorage = (event) => {
      if (event.key === null || storageKeys.includes(event.key)) {
        syncStoredThemeMode()
      }
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncStoredThemeMode()
      }
    }

    window.addEventListener('storage', handleStorage)
    if (!browserStorageKey) {
      window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncStoredThemeMode)
      window.addEventListener(AUTH_META_CHANGED_EVENT, syncStoredThemeMode)
    }
    window.addEventListener('focus', syncStoredThemeMode)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(
        AUTH_SESSION_CHANGED_EVENT,
        syncStoredThemeMode
      )
      window.removeEventListener(AUTH_META_CHANGED_EVENT, syncStoredThemeMode)
      window.removeEventListener('focus', syncStoredThemeMode)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [browserStorageKey])

  const effectiveTheme = resolveEffectiveERPTheme(themeMode, prefersDark)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.erpTheme = effectiveTheme
    root.dataset.erpThemeMode = themeMode
    root.style.colorScheme =
      effectiveTheme === ERP_THEME_MODE.DARK ? 'dark' : 'light'
    const accent = ERP_ACCENTS[appearance.accent]
    root.dataset.erpAccent = appearance.accent
    root.dataset.erpDensity = appearance.density
    root.dataset.erpTableLines = appearance.tableLines
    root.style.setProperty('--erp-accent', accent.primary)
    root.style.setProperty('--erp-accent-strong', accent.strong)
    root.style.setProperty(
      '--erp-accent-hover',
      effectiveTheme === ERP_THEME_MODE.DARK ? accent.darkHover : accent.hover
    )
    root.style.setProperty('--erp-accent-dark', accent.dark)
    root.style.setProperty(
      '--erp-on-accent',
      effectiveTheme === ERP_THEME_MODE.DARK
        ? ERP_DARK_PALETTE.onAccent
        : accent.onPrimary
    )
  }, [appearance, effectiveTheme, themeMode])

  const savePendingAppearance = useCallback(async () => {
    const session = sessionRef.current
    if (!session || savingSessionRef.current) return
    savingSessionRef.current = session
    setAppearanceSaving(true)
    setAppearanceSaveError('')
    const isCurrent = () =>
      mountedRef.current &&
      savingSessionRef.current === session &&
      sameAppearanceSession(session, getAppearanceSession(browserStorageKey))
    while (Object.keys(pendingPatchRef.current).length && isCurrent()) {
      const patch = pendingPatchRef.current
      pendingPatchRef.current = {}
      try {
        const saved = await setERPAppearance(patch)
        if (!isCurrent()) return
        const next = normalizeERPAccountAppearance({
          ...saved.appearance,
          ...pendingPatchRef.current,
        })
        preferencesRef.current = next
        setDisplayPreferences(next)
        // 仅接收本次保存的外观组，较早的响应不覆盖其他列设置。
        persistAdminERPPreferences({ appearance: saved.appearance }, session)
        cacheAccountAppearance(session, saved.appearance)
        retryPatchRef.current = {}
      } catch {
        if (!isCurrent()) return
        retryPatchRef.current = { ...patch, ...pendingPatchRef.current }
        pendingPatchRef.current = {}
        setAppearanceSaveError('外观设置未保存到账号，请重试。')
        break
      }
    }
    if (isCurrent()) {
      savingSessionRef.current = null
      setAppearanceSaving(false)
    }
  }, [browserStorageKey])

  const saveBrowserAppearance = useCallback(
    (value) => {
      try {
        const storage = getBrowserStorage()
        if (!storage) throw new Error('Browser storage unavailable')
        storage.setItem(browserStorageKey, JSON.stringify(value))
        retryPatchRef.current = {}
        setAppearanceSaveError('')
      } catch {
        retryPatchRef.current = value
        setAppearanceSaveError('外观设置未保存到此浏览器，请重试。')
      }
    },
    [browserStorageKey]
  )

  const updateAppearance = useCallback(
    (patch) => {
      const session = getAppearanceSession(browserStorageKey)
      if (!sameAppearanceSession(session, sessionRef.current)) {
        sessionRef.current = session
        preferencesRef.current = readSessionAppearance(
          session,
          browserStorageKey
        )
        pendingPatchRef.current = {}
        retryPatchRef.current = {}
        savingSessionRef.current = null
      }
      const next = normalizeERPAccountAppearance({
        ...preferencesRef.current,
        ...patch,
      })
      preferencesRef.current = next
      setDisplayPreferences(next)
      if (browserStorageKey) {
        saveBrowserAppearance(next)
        return
      }
      if (session) {
        pendingPatchRef.current = {
          ...retryPatchRef.current,
          ...pendingPatchRef.current,
          ...patch,
        }
        retryPatchRef.current = {}
        savePendingAppearance()
        return
      }
      cacheGuestAppearance(next)
    },
    [browserStorageKey, saveBrowserAppearance, savePendingAppearance]
  )

  const setAppearance = useCallback(
    (patch) => updateAppearance(patch),
    [updateAppearance]
  )
  const setThemeMode = useCallback(
    (mode) => updateAppearance({ theme_mode: normalizeERPThemeMode(mode) }),
    [updateAppearance]
  )
  const retryAppearanceSave = useCallback(() => {
    if (browserStorageKey) {
      saveBrowserAppearance(preferencesRef.current)
      return
    }
    pendingPatchRef.current = {
      ...retryPatchRef.current,
      ...pendingPatchRef.current,
    }
    retryPatchRef.current = {}
    savePendingAppearance()
  }, [browserStorageKey, saveBrowserAppearance, savePendingAppearance])

  const value = useMemo(
    () => ({
      themeMode,
      effectiveTheme,
      isDark: effectiveTheme === ERP_THEME_MODE.DARK,
      setThemeMode,
      appearance,
      setAppearance,
      appearanceSaving,
      appearanceSaveError,
      retryAppearanceSave,
      accent: ERP_ACCENTS[appearance.accent],
    }),
    [
      appearance,
      effectiveTheme,
      setAppearance,
      setThemeMode,
      themeMode,
      appearanceSaving,
      appearanceSaveError,
      retryAppearanceSave,
    ]
  )

  return (
    <ERPThemeContext.Provider value={value}>
      {children}
    </ERPThemeContext.Provider>
  )
}

export function useERPTheme() {
  const value = useContext(ERPThemeContext)
  if (!value) {
    throw new Error('ERPThemeProvider is missing')
  }
  return value
}
