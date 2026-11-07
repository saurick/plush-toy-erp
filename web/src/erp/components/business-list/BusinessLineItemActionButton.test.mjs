import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('共享行动作保留禁用边界、回调、原生 ref 和纯业务名称', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Action } = await import('./BusinessLineItemActionButton.jsx')
  const ref = React.createRef()
  let calls = 0
  const render = (disabled) => harness.render(h(Action, { action: 'remove', disabled, ref, onClick: () => { calls += 1 } }, '移除物料'))
  await render(true)
  const button = ref.current
  assert.equal(button.tagName, 'BUTTON')
  await act(() => button.click())
  assert.equal(calls, 0, '禁用时不能绕过原业务保护')
  await render(false)
  assert.equal(ref.current === button, true)
  await act(() => button.click())
  assert.equal(calls, 1)
  button.focus()
  assert.equal(document.activeElement === button, true)
  assert.equal(button.textContent.trim(), '移除物料')
  assert.equal(button.querySelector('[role="img"]').getAttribute('aria-hidden'), 'true', '装饰图标不进入业务动作名称')
})
