import assert from 'node:assert/strict'
import test from 'node:test'
import { ERP_ACCENTS } from '../../theme/erpAppearance.mjs'
import { ERP_DARK_PALETTE, ERP_LIGHT_PALETTE } from '../../theme/erpThemePalette.mjs'
import { getMermaidTheme } from './mermaidTheme.mjs'
import { getContrastRatio, parseRgb } from '../../../../scripts/style-l1/colorAssertions.mjs'

function assertEdgeLabelReadable(variables) {
  const foreground = parseRgb(variables.textColor)
  const background = parseRgb(variables.edgeLabelBackground)
  assert(foreground && background, '连线标签必须显式提供文字与底色')
  assert.equal(background[3], 1, '标签底色不可依赖 Mermaid 对透明色的重算')
  assert(getContrastRatio(foreground, background) >= 4.5, '连线标签对比度至少为 4.5:1')
}

for (const mode of ['light', 'dark']) {
  for (const accent of Object.keys(ERP_ACCENTS)) {
    test(`Mermaid ${mode}/${accent} keeps static relationships neutral`, () => {
      const palette = mode === 'dark' ? ERP_DARK_PALETTE : ERP_LIGHT_PALETTE
      const rendered = getMermaidTheme({ mode, accent })
      assert.equal(rendered.theme, 'base')
      assert.equal(rendered.themeVariables.darkMode, mode === 'dark')
      assert.equal(rendered.themeVariables.primaryBorderColor, palette.textMuted)
      assert.equal(rendered.themeVariables.lineColor, palette.textMuted)
      assert.notEqual(rendered.themeVariables.primaryColor, rendered.themeVariables.primaryTextColor)
      assertEdgeLabelReadable(rendered.themeVariables)
    })
  }
}

test('fixed presentation is independent of the screen accent in either mode', () => {
  for (const mode of ['light', 'dark']) {
    assert.deepEqual(getMermaidTheme({ mode, accent: 'pink', fixed: true }), getMermaidTheme({ mode, accent: 'blue', fixed: true }))
    assertEdgeLabelReadable(getMermaidTheme({ mode, fixed: true }).themeVariables)
  }
  const paper = getMermaidTheme({ mode: 'light', fixed: true })
  assert.equal(paper.themeVariables.lineColor, ERP_LIGHT_PALETTE.textMuted)
  assert.equal(paper.themeVariables.tertiaryColor, '#ffffff')
})
