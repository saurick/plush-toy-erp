export const ERP_THEME_MODE = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark',
}

export const ERP_THEME_STORAGE_KEY = 'plush_erp_theme_mode'

const themeModes = new Set(Object.values(ERP_THEME_MODE))

export function normalizeERPThemeMode(mode) {
  return themeModes.has(mode) ? mode : ERP_THEME_MODE.SYSTEM
}

export function resolveEffectiveERPTheme(mode, prefersDark) {
  const normalizedMode = normalizeERPThemeMode(mode)
  if (normalizedMode === ERP_THEME_MODE.DARK) return ERP_THEME_MODE.DARK
  if (normalizedMode === ERP_THEME_MODE.LIGHT) return ERP_THEME_MODE.LIGHT
  return prefersDark ? ERP_THEME_MODE.DARK : ERP_THEME_MODE.LIGHT
}
