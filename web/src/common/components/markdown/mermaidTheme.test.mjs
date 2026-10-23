import assert from 'node:assert/strict'
import test from 'node:test'
import { ERP_ACCENTS } from '../../theme/erpAppearance.mjs'
import { getMermaidTheme } from './mermaidTheme.mjs'

for (const mode of ['light', 'dark']) {
  for (const [accent, palette] of Object.entries(ERP_ACCENTS)) {
    test(`Mermaid ${mode}/${accent} follows the shared accent palette`, () => {
      const rendered = getMermaidTheme({ mode, accent })
      assert.equal(rendered.theme, 'base')
      assert.equal(rendered.themeVariables.darkMode, mode === 'dark')
      assert.equal(rendered.themeVariables.primaryBorderColor, mode === 'dark' ? palette.dark : palette.primary)
      assert.notEqual(rendered.themeVariables.primaryColor, rendered.themeVariables.primaryTextColor)
    })
  }
}

test('fixed presentation is independent of the screen accent in either mode', () => {
  for (const mode of ['light', 'dark']) {
    assert.deepEqual(getMermaidTheme({ mode, accent: 'pink', fixed: true }), getMermaidTheme({ mode, accent: 'blue', fixed: true }))
  }
  const paper = getMermaidTheme({ mode: 'light', fixed: true })
  assert.equal(paper.themeVariables.lineColor, '#2f6f4e')
  assert.equal(paper.themeVariables.tertiaryColor, '#ffffff')
})
