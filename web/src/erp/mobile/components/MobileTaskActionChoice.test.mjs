import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import assert from 'node:assert/strict'
import test from 'node:test'
import { registerJSXTestLoader, installTestDOM } from '../../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()

test('mobile actions stay directly visible and share selection, validation and access rules', async (t) => {
  const dom = installTestDOM()
  const { default: Screen } = await import('./MobileTaskActionScreen.jsx')
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const submissions = []
  let props = {
    task: { id: 42, task_name: '核对资料', task_status_key: 'ready' },
    accessState: 'actionable',
    availableActions: ['done', 'blocked', 'rejected', 'urge'],
    onSubmit: (value) => submissions.push(value),
  }
  const render = () => root.render(createElement(Screen, {
    ...props,
    onActionChange: (selectedAction) => { props = { ...props, selectedAction }; render() },
  }))
  const update = async (patch) => { props = { ...props, ...patch }; await act(async () => render()) }
  t.after(async () => { await act(async () => root.unmount()); host.remove(); dom.restore() })
  await update({})
  const visibleActions = () => [
    ...host.querySelectorAll('input[type="radio"]'),
  ].map((node) => node.value)
  assert.deepEqual(visibleActions(), [
    'done',
    'blocked',
    'rejected',
    'urge',
  ])
  assert.equal(host.querySelector('details'), null)
  await act(async () => host.querySelector('input[value="urge"]').click())
  await act(async () => host.querySelector('form').dispatchEvent(new dom.runtimeWindow.Event('submit', { bubbles: true, cancelable: true })))
  assert.equal(submissions.length, 0)
  assert.match(host.textContent, /催办原因为必填项/)
  await update({ reason: '请确认交期' })
  await act(async () => host.querySelector('form').dispatchEvent(new dom.runtimeWindow.Event('submit', { bubbles: true, cancelable: true })))
  assert.deepEqual(submissions, [{ action: 'urge', approvedQuantity: '', reason: '请确认交期' }])
  await update({ task: { ...props.task, required_capability_key: 'workflow.task.approve' } })
  assert.deepEqual(visibleActions(), ['done', 'rejected', 'blocked', 'urge'])
  await update({ accessState: 'urge-only', availableActions: ['urge'] })
  assert.ok(host.querySelector('[data-testid="mobile-task-single-action"]'))
  assert.equal(host.querySelector('details'), null)
  await update({ availableActions: [], accessState: 'readonly' })
  assert.equal(host.querySelector('input[type="radio"]'), null)
})
