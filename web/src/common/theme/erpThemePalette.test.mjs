import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { theme } from 'antd'
import { ERP_ACCENTS } from './erpAppearance.mjs'
import { ERP_DARK_PALETTE, getERPAccentTokens, getERPSurfaceTokens } from './erpThemePalette.mjs'

const themeCSS = readFileSync(
  new URL('../../erp/styles/app/theme-overrides.css', import.meta.url),
  'utf8'
)
const interactionDesign = readFileSync(
  new URL('../../../../docs/product/ui-design/index.html', import.meta.url),
  'utf8'
)

function channels(hex) {
  return hex
    .slice(1)
    .match(/../gu)
    .map((value) => Number.parseInt(value, 16))
}

function luminance(hex) {
  const [red, green, blue] = channels(hex).map((value) => {
    const channel = value / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function contrast(first, second) {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

function assertVariable(source, variable, expected, label) {
  assert.match(
    source,
    new RegExp(`--${variable}:\\s*${expected}\\s*;`, 'u'),
    `${label} 未同步 ${variable}=${expected}`
  )
}

test('dark surfaces are layered and keep fields and text readable', () => {
  const neutralKeys = [
    'page',
    'shell',
    'surface',
    'surfaceRaised',
    'surfaceSoft',
    'field',
    'fieldBorder',
    'border',
    'borderStrong',
  ]
  for (const key of neutralKeys) {
    const values = channels(ERP_DARK_PALETTE[key])
    assert.ok(
      Math.max(...values) - Math.min(...values) <= 21,
      `${key} 不能带明显色偏`
    )
  }

  const layers = ['page', 'shell', 'surface', 'surfaceSoft', 'surfaceRaised']
  for (let index = 1; index < layers.length; index += 1) {
    assert.ok(
      luminance(ERP_DARK_PALETTE[layers[index]]) >
        luminance(ERP_DARK_PALETTE[layers[index - 1]]),
      `${layers[index]} 必须比 ${layers[index - 1]} 更亮`
    )
  }

  for (const key of ['surface', 'surfaceSoft', 'surfaceRaised', 'field']) {
    const background = ERP_DARK_PALETTE[key]
    assert.ok(contrast(ERP_DARK_PALETTE.text, background) >= 7, `${key}: 正文`)
    assert.ok(contrast(ERP_DARK_PALETTE.textMuted, background) >= 4.5, `${key}: 辅助文字`)
    assert.ok(contrast(ERP_DARK_PALETTE.textSubtle, background) >= 4.5, `${key}: 说明与占位文字`)
  }
  for (const key of ['field', 'surface']) {
    assert.ok(contrast(ERP_DARK_PALETTE.fieldBorder, ERP_DARK_PALETTE[key]) >= 3, `${key}: 输入框边界`)
  }
})

test('Ant Design primary buttons and links retain contrast in default, hover and active states', () => {
  for (const isDark of [false, true]) {
    for (const [name, accent] of Object.entries(ERP_ACCENTS)) {
      const tokens = theme.getDesignToken({
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          ...getERPSurfaceTokens(isDark),
          ...getERPAccentTokens(isDark, accent),
        },
      })
      const onPrimary = isDark ? ERP_DARK_PALETTE.onAccent : accent.onPrimary
      const surface = isDark ? ERP_DARK_PALETTE.surface : '#ffffff'
      for (const key of ['colorPrimary', 'colorPrimaryHover', 'colorPrimaryActive']) {
        assert.ok(contrast(onPrimary, tokens[key]) >= 4.5, `${name}/${isDark}/${key}: primary button text`)
      }
      for (const key of ['colorLink', 'colorLinkHover', 'colorLinkActive']) {
        assert.ok(contrast(tokens[key], surface) >= 4.5, `${name}/${isDark}/${key}: link text`)
      }
    }
  }
})

test('runtime CSS and interaction design share the dark palette', () => {
  const runtimeVariables = {
    'erp-page-bg': ERP_DARK_PALETTE.page,
    'erp-shell-bg': ERP_DARK_PALETTE.shell,
    'erp-surface-bg': ERP_DARK_PALETTE.surface,
    'erp-surface-raised': ERP_DARK_PALETTE.surfaceRaised,
    'erp-surface-bg-soft': ERP_DARK_PALETTE.surfaceSoft,
    'erp-field-bg': ERP_DARK_PALETTE.field,
    'erp-field-border': ERP_DARK_PALETTE.fieldBorder,
    'erp-border': ERP_DARK_PALETTE.border,
    'erp-border-strong': ERP_DARK_PALETTE.borderStrong,
    'erp-text': ERP_DARK_PALETTE.text,
    'erp-text-muted': ERP_DARK_PALETTE.textMuted,
    'erp-text-subtle': ERP_DARK_PALETTE.textSubtle,
  }
  for (const [variable, value] of Object.entries(runtimeVariables)) {
    assertVariable(themeCSS, variable, value, '运行时暗色主题')
  }

  const designVariables = {
    canvas: ERP_DARK_PALETTE.page,
    shell: ERP_DARK_PALETTE.shell,
    surface: ERP_DARK_PALETTE.surface,
    'surface-raised': ERP_DARK_PALETTE.surfaceRaised,
    'surface-muted': ERP_DARK_PALETTE.surfaceSoft,
    'field-bg': ERP_DARK_PALETTE.field,
    'field-border': ERP_DARK_PALETTE.fieldBorder,
    line: ERP_DARK_PALETTE.border,
    'line-strong': ERP_DARK_PALETTE.borderStrong,
    text: ERP_DARK_PALETTE.text,
    'text-2': ERP_DARK_PALETTE.textMuted,
    'text-3': ERP_DARK_PALETTE.textSubtle,
  }
  for (const [variable, value] of Object.entries(designVariables)) {
    assertVariable(interactionDesign, variable, value, '交互设计暗色主题')
  }
})
