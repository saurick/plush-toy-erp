export const ERP_DARK_PALETTE = Object.freeze({
  page: '#050607',
  shell: '#080a0c',
  surface: '#0d1013',
  surfaceRaised: '#121619',
  surfaceSoft: '#151a1f',
  border: '#2a3138',
  borderStrong: '#3b4650',
  text: '#f4f7fa',
  textMuted: '#a7b0b9',
  textSubtle: '#7f8993',
  onAccent: '#050607',
})

// Surface tokens must follow the selected theme even inside an isolated preview.
export function getERPSurfaceTokens(isDark) {
  return {
    colorBgBase: isDark ? ERP_DARK_PALETTE.page : '#ffffff',
    colorBgLayout: isDark ? ERP_DARK_PALETTE.page : '#f2f5f3',
    colorBgContainer: isDark ? ERP_DARK_PALETTE.surface : '#ffffff',
    colorBgElevated: isDark ? ERP_DARK_PALETTE.surfaceRaised : '#ffffff',
    colorBorder: isDark ? ERP_DARK_PALETTE.border : '#dce4df',
    colorBorderSecondary: isDark ? ERP_DARK_PALETTE.border : '#dce4df',
    colorText: isDark ? ERP_DARK_PALETTE.text : '#1f2a24',
    colorTextSecondary: isDark ? ERP_DARK_PALETTE.textMuted : '#4d5d53',
  }
}
