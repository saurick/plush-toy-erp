import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  ERP_THEME_MODE,
  ERP_THEME_STORAGE_KEY,
  normalizeERPThemeMode,
  resolveEffectiveERPTheme,
} from './erpThemeMode.mjs'

export {
  ERP_THEME_MODE,
  ERP_THEME_STORAGE_KEY,
  normalizeERPThemeMode,
  resolveEffectiveERPTheme,
}

const ERPThemeContext = createContext(null)

function getInitialThemeMode() {
  if (typeof window === 'undefined') {
    return ERP_THEME_MODE.SYSTEM
  }
  return normalizeERPThemeMode(
    window.localStorage.getItem(ERP_THEME_STORAGE_KEY)
  )
}

function getInitialPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ERPThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(getInitialThemeMode)
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

  const effectiveTheme = resolveEffectiveERPTheme(themeMode, prefersDark)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.erpTheme = effectiveTheme
    root.dataset.erpThemeMode = themeMode
    root.style.colorScheme =
      effectiveTheme === ERP_THEME_MODE.DARK ? 'dark' : 'light'
  }, [effectiveTheme, themeMode])

  const setThemeMode = useCallback((nextMode) => {
    const normalizedMode = normalizeERPThemeMode(nextMode)
    setThemeModeState(normalizedMode)
    window.localStorage.setItem(ERP_THEME_STORAGE_KEY, normalizedMode)
  }, [])

  const value = useMemo(
    () => ({
      themeMode,
      effectiveTheme,
      isDark: effectiveTheme === ERP_THEME_MODE.DARK,
      setThemeMode,
    }),
    [effectiveTheme, setThemeMode, themeMode]
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
