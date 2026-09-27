import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
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
  readERPAppearance,
} from './erpAppearance.mjs'

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

export function ERPThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(getInitialThemeMode)
  const [appearance, setAppearanceState] = useState(() =>
    readERPAppearance(getBrowserStorage())
  )
  const [prefersDark, setPrefersDark] = useState(getInitialPrefersDark)

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
      const nextMode = getInitialThemeMode()
      setThemeModeState((currentMode) =>
        currentMode === nextMode ? currentMode : nextMode
      )
      setAppearanceState(readERPAppearance(getBrowserStorage()))
    }
    const handleStorage = (event) => {
      if (event.key === ERP_THEME_STORAGE_KEY || event.key === null) {
        setThemeModeState(normalizeERPThemeMode(event.newValue))
      }
      if (event.key === ERP_APPEARANCE_STORAGE_KEY || event.key === null) {
        setAppearanceState(readERPAppearance(getBrowserStorage()))
      }
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncStoredThemeMode()
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('focus', syncStoredThemeMode)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', syncStoredThemeMode)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

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
    root.style.setProperty('--erp-accent', accent.primary)
    root.style.setProperty('--erp-accent-strong', accent.strong)
    root.style.setProperty('--erp-accent-hover', accent.hover)
    root.style.setProperty('--erp-accent-dark', accent.dark)
    root.style.setProperty(
      '--erp-on-accent',
      effectiveTheme === ERP_THEME_MODE.DARK ? '#111713' : accent.onPrimary
    )
  }, [appearance, effectiveTheme, themeMode])

  const setAppearance = useCallback((next) => {
    setAppearanceState((current) => {
      const normalized = normalizeERPAppearance({ ...current, ...next })
      try {
        window.localStorage.setItem(
          ERP_APPEARANCE_STORAGE_KEY,
          JSON.stringify(normalized)
        )
      } catch {
        /* Display preferences remain usable when storage is unavailable. */
      }
      return normalized
    })
  }, [])

  const setThemeMode = useCallback((nextMode) => {
    const normalizedMode = normalizeERPThemeMode(nextMode)
    setThemeModeState(normalizedMode)
    try {
      getBrowserStorage()?.setItem(ERP_THEME_STORAGE_KEY, normalizedMode)
    } catch {
      /* The current theme still works when browser storage is unavailable. */
    }
  }, [])

  const value = useMemo(
    () => ({
      themeMode,
      effectiveTheme,
      isDark: effectiveTheme === ERP_THEME_MODE.DARK,
      setThemeMode,
      appearance,
      setAppearance,
      accent: ERP_ACCENTS[appearance.accent],
    }),
    [appearance, effectiveTheme, setAppearance, setThemeMode, themeMode]
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
