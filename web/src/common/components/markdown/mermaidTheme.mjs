import { theme as antdTheme } from 'antd'
import { ERP_ACCENTS, normalizeERPAppearance } from '../../theme/erpAppearance.mjs'
import { getERPAccentTokens, getERPSurfaceTokens } from '../../theme/erpThemePalette.mjs'

const fontFamily = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

// 显式指定明暗模式的纸面与固定预览保持独立配色，不读取浏览器主题色。
const fixedThemes = {
  light: {
    theme: 'base',
    themeVariables: {
      primaryColor: '#eef7ef',
      primaryTextColor: '#173f2a',
      primaryBorderColor: '#8cc49a',
      lineColor: '#2f6f4e',
      secondaryColor: '#f8fbf8',
      tertiaryColor: '#ffffff',
      fontFamily,
    },
  },
  dark: {
    theme: 'dark',
    themeVariables: {
      primaryColor: '#16351f',
      primaryTextColor: '#e5edf5',
      primaryBorderColor: '#3f7d53',
      lineColor: '#86efac',
      secondaryColor: '#0f172a',
      tertiaryColor: '#111827',
      fontFamily,
    },
  },
}

export function getMermaidTheme({ mode, accent, fixed = false }) {
  const isDark = mode === 'dark'
  if (fixed) return fixedThemes[isDark ? 'dark' : 'light']
  const palette = ERP_ACCENTS[normalizeERPAppearance({ accent }).accent]
  const accentTokens = getERPAccentTokens(isDark, palette)
  const token = antdTheme.getDesignToken({
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: { ...getERPSurfaceTokens(isDark), ...accentTokens },
  })
  return {
    theme: 'base',
    themeVariables: {
      darkMode: isDark,
      primaryColor: token.colorPrimaryBg,
      primaryTextColor: token.colorText,
      primaryBorderColor: accentTokens.colorPrimary,
      lineColor: accentTokens.colorLink,
      secondaryColor: token.colorFillAlter,
      tertiaryColor: token.colorBgContainer,
      fontFamily,
    },
  }
}
