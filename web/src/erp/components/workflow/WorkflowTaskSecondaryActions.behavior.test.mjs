import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import assert from 'node:assert/strict'
import test from 'node:test'
import { registerJSXTestLoader, installTestDOM } from '../../../../scripts/test/reactRuntime.mjs'

test('task collaboration has one menu, respects disabled actions and returns the stable trigger', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const { default: Actions, WorkflowTaskActionGroup } = await import('./WorkflowTaskSecondaryActions.jsx')
  const node = document.createElement('div'); document.body.appendChild(node)
  const root = createRoot(node)
  const calls = []
  const actions = [{ key: 'block', label: '标记任务受阻', onClick: (trigger) => calls.push(trigger === node.querySelector('button')) }, { key: 'assign', label: '指派任务', disabled: true, onClick: () => calls.push(false) }]
  t.after(async () => { await act(async () => root.unmount()); node.remove(); dom.restore() })
  await act(async () => root.render(createElement(Actions, { actions })))
  assert.equal(node.querySelectorAll('button').length, 1)
  assert.equal(node.textContent.trim(), '更多')
  await act(async () => node.querySelector('button').click())
  const item = (label) => [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent.trim() === label)
  assert.equal(item('指派任务').getAttribute('aria-disabled'), 'true')
  await act(async () => item('标记任务受阻').click())
  assert.deepEqual(calls, [true])
  await act(async () => root.render(createElement(Actions, { actions, disabled: true })))
  assert.equal(node.querySelector('button').disabled, true)
  await act(async () => root.render(createElement(Actions, { actions: [] })))
  assert.equal(node.querySelector('button'), null)
  await act(async () => root.render(createElement(WorkflowTaskActionGroup, { label: '业务办理' }, createElement('button', null, '保存草稿'))))
  assert.equal(node.querySelector('[role="group"]').getAttribute('aria-label'), '业务办理')
  assert.equal(node.textContent, '保存草稿')
})
