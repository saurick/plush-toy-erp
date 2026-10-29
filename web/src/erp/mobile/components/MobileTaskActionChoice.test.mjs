import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import assert from 'node:assert/strict'
import test from 'node:test'
import { registerJSXTestLoader, installTestDOM } from '../../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()

test('mobile keeps decisions in the form and authorized coordination in the bottom action group', async (t) => {
  const dom = installTestDOM()
  const { default: Screen } = await import('./MobileTaskActionScreen.jsx')
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const submissions = []
  const opened = []
  let props = {
    task: { id: 42, task_name: '核对资料', task_status_key: 'ready' },
    accessState: 'actionable',
    availableActions: ['done', 'blocked', 'rejected', 'urge'],
    collaborationActions: [{ key: 'block', label: '标记任务受阻', onClick: () => opened.push('block') }],
    onSubmit: (value) => submissions.push(value),
  }
  const render = () => root.render(createElement(Screen, {
    ...props,
    onActionChange: (selectedAction) => { props = { ...props, selectedAction }; render() },
  }))
  const update = async (patch) => { props = { ...props, ...patch }; await act(async () => render()) }
  t.after(async () => { await act(async () => root.unmount()); host.remove(); dom.restore() })
  await update({})
  const visibleActions = () => [...host.querySelectorAll('input[type="radio"]')].map((node) => node.value)
  assert.deepEqual(visibleActions(), ['done', 'rejected'])
  const common = () => host.querySelector('.mobile-role-action-bar .erp-task-secondary-actions')
  assert.ok(common())
  assert.equal(host.querySelector('main .erp-task-secondary-actions'), null)
  await act(async () => common().click())
  await act(async () => [...document.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent === '标记任务受阻').click())
  assert.deepEqual(opened, ['block'])
  assert.deepEqual(submissions, [])
  await act(async () => host.querySelector('input[value="rejected"]').click())
  await act(async () => host.querySelector('form').dispatchEvent(new dom.runtimeWindow.Event('submit', { bubbles: true, cancelable: true })))
  assert.equal(submissions.length, 0)
  assert.match(host.textContent, /退回原因为必填项/)
  await update({ reason: '请补齐交期依据' })
  await act(async () => host.querySelector('form').dispatchEvent(new dom.runtimeWindow.Event('submit', { bubbles: true, cancelable: true })))
  assert.deepEqual(submissions, [{ action: 'rejected', approvedQuantity: '', reason: '请补齐交期依据' }])
  await update({ task: { ...props.task, required_capability_key: 'workflow.task.approve' } })
  assert.deepEqual(visibleActions(), ['done', 'rejected'])
  assert.match(host.textContent, /审批通过.*审批退回/su)
  await update({ selectedAction: 'done' })
  assert.equal(host.querySelector('textarea').getAttribute('aria-label'), '审批意见')
  await update({ accessState: 'urge-only', availableActions: ['urge'], collaborationActions: [{ key: 'urge', label: '催办任务', onClick: () => opened.push('urge') }] })
  assert.equal(host.querySelector('input[type="radio"]'), null)
  assert.equal(host.querySelector('textarea'), null)
  assert.equal(host.querySelector('button[type="submit"]'), null)
  assert.equal(common().textContent.trim(), '更多')
  await act(async () => common().click())
  assert.equal([...document.querySelectorAll('[role="menuitem"]')].some((node) => node.textContent === '催办任务'), true)
  await update({ busy: true })
  assert.equal(host.querySelector('[data-testid="mobile-task-attachment-action"]').disabled, true)
  assert.equal(common().disabled, true)
  await update({ busy: false, availableActions: [], collaborationActions: [], accessState: 'readonly' })
  assert.equal(common(), null)
})

test('completed, rejected and withdrawn mobile tasks keep recorded handling readable and never submit again', async (t) => {
  const dom = installTestDOM()
  const [{ default: Screen }, { JsonRpc }] = await Promise.all([import('./MobileTaskActionScreen.jsx'), import('../../../common/utils/jsonRpc.js')])
  const originalCall = JsonRpc.prototype.call
  const calls = []
  JsonRpc.prototype.call = async (method, params) => {
    calls.push({ method, params })
    if (method === 'list_attachments') return { data: { attachments: [] } }
    assert.equal(method, 'list_task_events')
    return { data: { items: [{ id: 1, task_id: params.task_id, event_type: 'status_changed', actor_display_name: '核对员', actor_role_key: 'engineering', created_at: 1790085800, from_status_key: 'ready', to_status_key: 'done', reason: '本次资料已经核对' }], truncated: false } }
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  let submits = 0
  let receipts = 0
  const onSubmit = () => { submits += 1 }
  const onViewReceipt = () => { receipts += 1 }
  t.after(async () => { await act(async () => root.unmount()); host.remove(); JsonRpc.prototype.call = originalCall; dom.restore() })
  for (const [index, status] of ['done', 'rejected', 'withdrawn'].entries()) {
    const task = { id: 42 + index, version: 2, task_name: '核对资料', task_status_key: status, owner_role_key: 'engineering' }
    const props = { task, accessState: 'actionable', availableActions: ['done'], selectedAction: 'done', canViewReceipt: true, onSubmit, onViewReceipt }
    const render = (patch = {}) => act(async () => root.render(createElement(Screen, { ...props, ...patch })))
    await render()
    assert.match(host.textContent, /本次资料已经核对/u)
    assert.equal(host.querySelector('button[type="submit"]'), null)
    assert.equal(host.querySelector('textarea'), null)
    const reads = calls.length
    await render({ reason: '不可再次提交的旧草稿' })
    assert.equal(calls.length, reads, 'revisiting a recorded step reuses the same task history')
    await act(async () => host.querySelector('form').dispatchEvent(new dom.runtimeWindow.Event('submit', { bubbles: true, cancelable: true })))
    await act(async () => host.querySelector('[data-step-key="result"]').click())
    assert.equal(submits, 0)
  }
  assert.equal(receipts, 3)
})
