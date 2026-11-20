import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('supplemental help shares one pinned explanation, closes on Escape and outside input, and preserves page state', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: Help } = await import('./SupplementalHelp.jsx')
  await ui.render(createElement('div', null, createElement('input', { 'aria-label': '草稿', defaultValue: '保留输入' }), createElement(Help, { label: '第一项', content: '第一项说明' }), createElement(Help, { label: '第二项', content: '第二项说明' })
  ))
  const first = document.querySelector('[aria-label="查看第一项说明"]')
  const second = document.querySelector('[aria-label="查看第二项说明"]')
  await ui.act(async () => first.click())
  assert.equal(first.getAttribute('aria-expanded'), 'true')
  assert.equal(Boolean(document.querySelector('.erp-supplemental-help-content')), true)
  await ui.act(async () => first.click())
  assert.equal(first.getAttribute('aria-expanded'), 'false', '第二次点按收起说明')
  await ui.act(async () => first.click())
  await ui.act(async () => second.click())
  assert.equal(first.getAttribute('aria-expanded'), 'false', '打开另一说明会收起原来的固定说明')
  assert.equal(second.getAttribute('aria-expanded'), 'true')
  const composingEscape = new ui.runtimeWindow.KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })
  await ui.act(async () => second.dispatchEvent(composingEscape))
  assert.equal(second.getAttribute('aria-expanded'), 'true', '输入法组词期间的 Escape 由输入法处理')
  assert.equal(composingEscape.defaultPrevented, false)
  const escape = new ui.runtimeWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  await ui.act(async () => second.dispatchEvent(escape))
  assert.equal(second.getAttribute('aria-expanded'), 'false')
  assert.equal(escape.defaultPrevented, true)
  await ui.act(async () => first.click())
  await ui.act(async () => document.querySelector('input').dispatchEvent(new ui.runtimeWindow.PointerEvent('pointerdown', { bubbles: true })))
  assert.equal(first.getAttribute('aria-expanded'), 'false')
  assert.equal(document.querySelector('input').value, '保留输入')
})

test('closing a parent dialog clears supplementary help and explicit content close restores its trigger', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ default: Help }, { OverlayDialogOpenContext }] = await Promise.all([
    import('./SupplementalHelp.jsx'), import('../overlay/OverlayScopeContext.mjs'),
  ])
  const render = (open) => ui.render(createElement(OverlayDialogOpenContext.Provider, { value: open }, createElement(Help, { label: '当前说明', renderContent: (close) => createElement('button', { onClick: () => close() }, '收起说明') })
  ))
  await render(true)
  const trigger = document.querySelector('[aria-label="查看当前说明说明"]')
  await ui.act(async () => trigger.click())
  await ui.act(async () => document.querySelector('.erp-supplemental-help-content button').click())
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement === trigger, true)
  await ui.act(async () => trigger.click())
  await render(false)
  await render(true)
  assert.equal(trigger.getAttribute('aria-expanded'), 'false', '父弹窗重开不恢复过期帮助')
})
