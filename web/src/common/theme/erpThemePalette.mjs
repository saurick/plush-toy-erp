export const ERP_LIGHT_PALETTE = Object.freeze({
  page: '#f2f5f3',
  shell: '#ffffff',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  surfaceSoft: '#f7f9f8',
  border: '#dce4df',
  borderStrong: '#bccbc2',
  text: '#1f2a24',
  textMuted: '#4d5d53',
  textSubtle: '#65756b',
})

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

export function getERPAccentTokens(isDark, accent) {
  const primary = isDark ? accent.dark : accent.primary
  const hover = isDark ? accent.darkHover : accent.hover
  const strong = isDark ? accent.dark : accent.strong
  return {
    colorPrimary: primary,
    colorPrimaryHover: hover,
    colorPrimaryActive: strong,
    colorLink: strong,
    colorLinkHover: hover,
    colorLinkActive: strong,
  }
}

// Surface tokens must follow the selected theme even inside an isolated preview.
export function getERPSurfaceTokens(isDark) {
  const palette = isDark ? ERP_DARK_PALETTE : ERP_LIGHT_PALETTE
  return {
    colorBgBase: isDark ? palette.page : palette.surface,
    colorBgLayout: palette.page,
    colorBgContainer: palette.surface,
    colorBgElevated: palette.surfaceRaised,
    colorBorder: palette.border,
    colorBorderSecondary: palette.border,
    colorText: palette.text,
    colorTextSecondary: palette.textMuted,
  }
}

// A local preview must reset inherited CSS colors as well as Ant Design tokens.
export function getERPThemeScopeStyle(isDark, accent) {
  const palette = isDark ? ERP_DARK_PALETTE : ERP_LIGHT_PALETTE
  const tokens = getERPAccentTokens(isDark, accent)
  return {
    colorScheme: isDark ? 'dark' : 'light',
    '--erp-page-bg': palette.page,
    '--erp-shell-bg': palette.shell,
    '--erp-surface-bg': palette.surface,
    '--erp-surface-bg-soft': palette.surfaceSoft,
    '--erp-surface-bg-muted': palette.surfaceSoft,
    '--erp-surface-raised': palette.surfaceRaised,
    '--erp-border': palette.border,
    '--erp-border-strong': palette.borderStrong,
    '--erp-modal-bg': palette.surface,
    '--erp-modal-bg-soft': palette.surfaceRaised,
    '--erp-modal-bg-elevated': palette.surfaceSoft,
    '--erp-modal-border': palette.border,
    '--erp-modal-divider': palette.border,
    '--erp-text': palette.text,
    '--erp-text-muted': palette.textMuted,
    '--erp-text-subtle': palette.textSubtle,
    '--erp-accent-hover': tokens.colorPrimaryHover,
    '--erp-on-accent': isDark ? palette.onAccent : accent.onPrimary,
    '--erp-primary': tokens.colorPrimary,
    '--erp-primary-strong': tokens.colorPrimaryActive,
    '--erp-primary-soft': `color-mix(in srgb, var(--erp-accent) ${isDark ? 20 : 13}%, var(--erp-surface-bg))`,
    '--erp-primary-softer': 'color-mix(in srgb, var(--erp-accent) 6.5%, var(--erp-surface-bg))',
    '--erp-interactive-border-hover': isDark ? palette.borderStrong : accent.primary,
    '--erp-interactive-border-focus': tokens.colorPrimary,
    '--erp-interactive-bg-hover': 'var(--erp-primary-softer)',
    '--erp-interactive-bg-active': 'var(--erp-primary-soft)',
    '--erp-interactive-text-hover': isDark ? palette.text : accent.strong,
    '--erp-focus-ring': `color-mix(in srgb, ${tokens.colorPrimary} ${isDark ? 22 : 16}%, transparent)`,
  }
}
