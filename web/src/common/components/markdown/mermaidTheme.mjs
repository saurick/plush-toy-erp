import { ERP_DARK_PALETTE, ERP_LIGHT_PALETTE } from '../../theme/erpThemePalette.mjs'

const fontFamily = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

// Ordinary rules/relations are neutral. Selection uses the interface accent;
// actual results use the shared semantic palette, independently of that accent.
export function getMermaidTheme({ mode }) {
  const palette = mode === 'dark' ? ERP_DARK_PALETTE : ERP_LIGHT_PALETTE
  return {
    theme: 'base',
    themeVariables: {
      darkMode: mode === 'dark',
      primaryColor: palette.surfaceSoft,
      primaryTextColor: palette.text,
      textColor: palette.text,
      edgeLabelBackground: palette.surface,
      primaryBorderColor: palette.textMuted,
      lineColor: palette.textMuted,
      secondaryColor: palette.surfaceSoft,
      tertiaryColor: palette.surface,
      fontFamily,
    },
  }
}
