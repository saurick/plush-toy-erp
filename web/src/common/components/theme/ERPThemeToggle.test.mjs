import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('controlled appearance dialogs discard open help even when reopened before the close animation finishes', async (t) => {
  const runtime = await createReactTestHarness(t)
  const [{ default: ERPThemeToggle }, { ERPThemeContext }] = await Promise.all([
    import('./ERPThemeToggle.jsx'), import('../../theme/erpThemeContext.jsx'),
  ])
  const saves = []
  const dialogChanges = []
  const theme = {
    themeMode: 'light',
    setThemeMode: (value) => saves.push(value),
    appearance: { accent: 'blue', density: 'compact', tableLines: 'grid', formDisplay: 'all' },
    setAppearance: (value) => saves.push(value),
    appearanceSaving: false,
    appearanceSaveError: '',
    retryAppearanceSave() {},
  }
  const render = (props) => {
    const toggle = createElement(ERPThemeToggle, { variant: 'dialog', open: true, onOpenChange: (value) => dialogChanges.push(value), ...props })
    return runtime.render(createElement(ERPThemeContext.Provider, { value: theme }, toggle))
  }
  const help = () => document.querySelector('button[aria-label="查看表格密度说明"]')
  await render()
  assert.equal(Boolean(help()), true)
  await runtime.act(async () => help().click())
  assert.equal(help().getAttribute('aria-expanded'), 'true')
  await render({ open: false })
  await render({ open: true })
  assert.equal(help().getAttribute('aria-expanded'), 'false', '外部关闭不能在快速重开后恢复旧说明')
  await runtime.act(async () => help().click())
  assert.equal(help().getAttribute('aria-expanded'), 'true')
  await runtime.act(async () => document.dispatchEvent(new runtime.runtimeWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  assert.equal(help().getAttribute('aria-expanded'), 'false')
  assert.deepEqual(dialogChanges, [], '关闭说明没有要求关闭外层弹窗')
  assert.deepEqual(saves, [], '说明状态不修改外观偏好')
  await render({ showDensity: false })
  assert.equal(document.querySelectorAll('.erp-appearance-help-trigger').length, 0, '登录页继续只展示主题和明暗')
  await render({ variant: 'settings' })
  assert.equal(document.querySelectorAll('.erp-appearance-settings--mobile .erp-appearance-help-trigger').length, 0, '手机行内设置不增加桌面选项')
})
