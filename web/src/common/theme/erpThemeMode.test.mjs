import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ERP_THEME_MODE,
  normalizeERPThemeMode,
  resolveEffectiveERPTheme,
} from './erpThemeMode.mjs'

test('normalizeERPThemeMode: 非法值回到 system', () => {
  assert.equal(normalizeERPThemeMode('night'), ERP_THEME_MODE.SYSTEM)
  assert.equal(normalizeERPThemeMode(undefined), ERP_THEME_MODE.SYSTEM)
})

test('resolveEffectiveERPTheme: system 跟随系统偏好', () => {
  assert.equal(
    resolveEffectiveERPTheme(ERP_THEME_MODE.SYSTEM, true),
    ERP_THEME_MODE.DARK
  )
  assert.equal(
    resolveEffectiveERPTheme(ERP_THEME_MODE.SYSTEM, false),
    ERP_THEME_MODE.LIGHT
  )
})

test('resolveEffectiveERPTheme: 手动浅色和暗色优先于系统偏好', () => {
  assert.equal(
    resolveEffectiveERPTheme(ERP_THEME_MODE.LIGHT, true),
    ERP_THEME_MODE.LIGHT
  )
  assert.equal(
    resolveEffectiveERPTheme(ERP_THEME_MODE.DARK, false),
    ERP_THEME_MODE.DARK
  )
})
