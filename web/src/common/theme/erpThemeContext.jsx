import { createContext, useContext } from 'react'

export const ERPThemeContext = createContext(null)

export function useERPTheme() {
  const value = useContext(ERPThemeContext)
  if (!value) {
    throw new Error('ERPThemeProvider is missing')
  }
  return value
}
