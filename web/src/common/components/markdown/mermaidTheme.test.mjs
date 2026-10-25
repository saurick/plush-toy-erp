import assert from 'node:assert/strict'
import test from 'node:test'
import { ERP_ACCENTS } from '../../theme/erpAppearance.mjs'
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
  for (const [accent, palette] of Object.entries(ERP_ACCENTS)) {
    test(`Mermaid ${mode}/${accent} follows the shared accent palette`, () => {
      const rendered = getMermaidTheme({ mode, accent })
      assert.equal(rendered.theme, 'base')
      assert.equal(rendered.themeVariables.darkMode, mode === 'dark')
      assert.equal(rendered.themeVariables.primaryBorderColor, mode === 'dark' ? palette.dark : palette.primary)
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
  assert.equal(paper.themeVariables.lineColor, '#2f6f4e')
  assert.equal(paper.themeVariables.tertiaryColor, '#ffffff')
})
