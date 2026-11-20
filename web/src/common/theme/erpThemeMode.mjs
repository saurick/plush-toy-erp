import appearanceContract from '../../../../server/internal/biz/admin_erp_appearance.json' with { type: 'json' }

export const ERP_THEME_MODE = Object.freeze(
  Object.fromEntries(
    appearanceContract.theme_modes.map((mode) => [mode.toUpperCase(), mode])
  )
)

export const ERP_THEME_STORAGE_KEY = 'plush_erp_theme_mode'

const themeModes = new Set(Object.values(ERP_THEME_MODE))

export function normalizeERPThemeMode(mode) {
  return themeModes.has(mode) ? mode : appearanceContract.defaults.theme_mode
}

export function resolveEffectiveERPTheme(mode, prefersDark) {
  const normalizedMode = normalizeERPThemeMode(mode)
  if (normalizedMode === ERP_THEME_MODE.DARK) return ERP_THEME_MODE.DARK
  if (normalizedMode === ERP_THEME_MODE.LIGHT) return ERP_THEME_MODE.LIGHT
  return prefersDark ? ERP_THEME_MODE.DARK : ERP_THEME_MODE.LIGHT
}
