import { theme } from 'antd'
import { ERP_DARK_PALETTE, ERP_LIGHT_PALETTE, getERPAccentTokens, getERPSurfaceTokens } from './erpThemePalette.mjs'

// Entry points and isolated previews share this baseline; their providers own preferences.
export function createERPAntdTheme({ isDark, accent, density, mobile = false, workbench = false }) {
  const phone = mobile && !workbench
  const cellPaddingBlock = density === 'compact' ? 4 : 9
  const palette = isDark ? ERP_DARK_PALETTE : ERP_LIGHT_PALETTE
  const fieldTokens = {
    colorBgContainer: isDark ? palette.page : palette.surface,
    colorTextPlaceholder: palette.textSubtle,
  }
  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    components: {
      Input: fieldTokens,
      InputNumber: fieldTokens,
      DatePicker: fieldTokens,
      Select: { ...fieldTokens, selectorBg: fieldTokens.colorBgContainer },
      Modal: {
        contentBg: palette.surface,
        headerBg: palette.surface,
        footerBg: palette.surface,
        titleColor: palette.text,
      },
      Drawer: { colorBgElevated: palette.surface },
      Message: { contentBg: palette.surfaceSoft },
      Notification: { colorBgElevated: palette.surfaceSoft },
      Popover: { colorBgElevated: isDark ? palette.surfaceSoft : palette.surfaceRaised },
      Tooltip: {
        colorBgSpotlight: isDark ? palette.surfaceSoft : 'rgba(0, 0, 0, 0.85)',
        colorTextLightSolid: isDark ? palette.text : '#ffffff',
      },
      Button: {
        controlHeight: phone ? 44 : 34,
        paddingInline: 12,
        paddingInlineSM: 12,
        paddingInlineLG: 16,
        primaryColor: isDark ? ERP_DARK_PALETTE.onAccent : accent.onPrimary,
      },
      Table: {
        cellPaddingBlock,
        cellPaddingBlockMD: cellPaddingBlock,
        cellPaddingBlockSM: cellPaddingBlock,
        cellPaddingInlineSM: 11,
        headerBg: palette.surfaceSoft,
        headerColor: palette.textMuted,
        rowSelectedBg: 'var(--erp-primary-softer)',
        rowSelectedHoverBg: 'var(--erp-primary-soft)',
        rowHoverBg: 'var(--erp-surface-bg-soft)',
      },
    },
    token: {
      ...getERPAccentTokens(isDark, accent),
      ...getERPSurfaceTokens(isDark),
      colorInfo: isDark ? '#75b9ff' : '#3275c7',
      borderRadius: 8,
      fontSize: phone ? 16 : 14,
      fontSizeSM: phone || workbench ? 14 : 12,
      controlHeight: phone ? 46 : 34,
      controlHeightSM: phone ? 44 : 28,
      controlHeightLG: phone ? 48 : 40,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    },
  }
}
