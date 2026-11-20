import test from 'node:test'
import assert from 'node:assert/strict'
import { theme } from 'antd'
import { ERP_ACCENTS } from './erpAppearance.mjs'
import { createERPAntdTheme } from './erpAntdTheme.mjs'

test('shared theme preserves desktop controls, phone touch targets and workbench density', () => {
  const baseline = { isDark: false, accent: ERP_ACCENTS.blue, density: 'compact' }
  const desktop = createERPAntdTheme(baseline)
  const phone = createERPAntdTheme({ ...baseline, mobile: true })
  const workbench = createERPAntdTheme({ ...baseline, workbench: true, mobile: true })
  for (const config of [desktop, phone, workbench]) {
    const { paddingInline, paddingInlineSM, paddingInlineLG } = config.components.Button
    assert.deepEqual([paddingInline, paddingInlineSM, paddingInlineLG], [12, 12, 16])
    assert.equal(config.components.Table.cellPaddingBlock, 4)
  }
  assert.equal(theme.getDesignToken(desktop).controlHeight, 34)
  assert.equal(theme.getDesignToken(phone).controlHeight, 46)
  assert.equal(phone.components.Button.controlHeight, 44)
  assert.equal(theme.getDesignToken(phone).fontSize, 16)
  assert.equal(theme.getDesignToken(workbench).controlHeight, 34)
  assert.equal(theme.getDesignToken(workbench).fontSizeSM, 14)
  assert.equal(theme.getDesignToken(desktop).fontSizeSM, 12)
})

test('theme and density changes do not mutate another entry or its preferences', () => {
  const preferences = Object.freeze({ isDark: false, accent: ERP_ACCENTS.teal, density: 'compact' })
  const compact = createERPAntdTheme(preferences)
  const dark = createERPAntdTheme({ ...preferences, isDark: true, density: 'standard' })
  assert.equal(dark.components.Table.cellPaddingBlock, 9)
  assert.equal(compact.components.Table.cellPaddingBlock, 4)
  assert.notEqual(theme.getDesignToken(compact).colorBgContainer, theme.getDesignToken(dark).colorBgContainer)
  assert.notEqual(compact.components.Button.primaryColor, dark.components.Button.primaryColor)
  assert.deepEqual(createERPAntdTheme(preferences), compact)
})
