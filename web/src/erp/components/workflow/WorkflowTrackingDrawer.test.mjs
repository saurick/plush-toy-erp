import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

const now = 1791367200
const task = { task_id: 30, task_name: '订单审批', node_instance_id: 20, owner_role_key: 'boss', required_capability_key: 'workflow.task.approve', assignee_name: '', status: 'ready', created_at: now, completed_at: null, due_at: null }
const detail = {
  summary: { kind: 'process', id: 10, process_key: 'sales_order_acceptance', title: '', source_type: 'sales_order', source_id: 1, source_no: 'SO-TRACK', display_context: null, status: 'active', resolution_kind: null, started_at: now, updated_at: now, completed_at: null, initiator_name: '业务小李', initiator_role_key: 'sales', current_tasks: [task] },
  tasks: [task],
  current_task_access: [{ task_id: 30, can_read: false, can_handle: false }],
  nodes: [{ id: 20, process_instance_id: 10, node_key: 'order_approval', node_type: 'approval', status: 'active', started_at: now, completed_at: null, completed_by_name: '' }],
  events: [],
  events_truncated: false,
  next_event_id: 0,
}

test('tracking hides unauthorized entries, keeps footer actions separate and cancels stale opens', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Drawer }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowTrackingDrawer.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const calls = []
  const opened = []
  let outcome = 'denied'
  let pending
  JsonRpc.prototype.call = async (method, params, options) => {
    calls.push(method)
    if (method === 'get_tracking') return { data: { tracking: detail } }
    assert.equal(method, 'get_task')
    assert.deepEqual(params, { task_id: 30 })
    if (outcome === 'denied') throw Object.assign(new Error('没有查看该任务的权限'), { code: 40304 })
    if (outcome === 'pending') return new Promise((resolve) => { pending = { resolve, signal: options.signal } })
    return { data: { task: { id: outcome === 'mismatch' ? 99 : 30, version: 7, task_status_key: 'ready' } } }
  }
  const node = document.createElement('div')
  document.body.appendChild(node)
  const root = createRoot(node)
  const render = (ref, refreshKey = 'session-one') => act(async () => root.render(createElement(Drawer, { trackingRef: ref, refreshKey, onClose() {}, onOpenTask: (value) => opened.push(value) })))
  const taskButton = () => document.querySelector('.erp-workflow-tracking-footer .erp-workflow-tracking-open-task')
  const refreshButton = () => [...document.querySelectorAll('.ant-drawer-footer button')].find((button) => button.textContent.trim() === '刷新进度')
  const clickTask = () => act(async () => taskButton().click())
  t.after(async () => {
    await act(async () => root.unmount())
    node.remove(); JsonRpc.prototype.call = original; dom.restore()
  })
  const ref = { kind: 'process', id: 10 }
  await render(ref)
  assert.equal(taskButton(), null)
  assert.doesNotMatch(document.querySelector('.ant-drawer-header').textContent, /刷新进度/)
  assert.ok(refreshButton(), 'tracking refresh remains in the fixed footer even without task access')
  assert.match(document.querySelector('[aria-label="流程概况"] [aria-label="当前进度"]').textContent, /当前：订单审批.*岗位：老板.*待审批/)
  assert.equal(document.querySelector('[aria-label="当前进度"] button'), null)
  assert.deepEqual(calls, ['get_tracking'], 'summary-only access must not probe the task endpoint')
  await act(async () => refreshButton().click())
  assert.deepEqual(calls, ['get_tracking', 'get_tracking'], 'footer refresh rereads the current tracking record')
  detail.current_task_access[0].can_read = true
  await render(ref, 'read-only')
  assert.equal(taskButton().textContent, '查看任务')
  await clickTask()
  assert.match(document.querySelector('.erp-workflow-tracking-footer [role="alert"]').textContent, /权限/)
  assert.equal(document.querySelector('[aria-label="当前进度"] [role="alert"]'), null)
  assert.equal(opened.length, 0)
  detail.current_task_access[0].can_handle = true
  await render(ref, 'can-handle')
  assert.equal(taskButton().textContent, '去审批')
  outcome = 'mismatch'
  await clickTask()
  assert.equal(opened.length, 0)
  outcome = 'pending'
  await clickTask()
  assert.equal(refreshButton().disabled, true, 'refresh cannot cancel a pending task entry')
  await act(async () => refreshButton().click())
  assert.equal(pending.signal.aborted, false)
  await render(null)
  assert.equal(taskButton(), null)
  assert.equal(pending.signal.aborted, true)
  await act(async () => pending.resolve({ data: { task: { id: 30, version: 7, task_status_key: 'ready' } } }))
  assert.equal(opened.length, 0)
  await render(ref, 'session-two')
  outcome = 'allowed'
  await clickTask()
  assert.deepEqual(opened, [{ id: 30, version: 7, task_status_key: 'ready' }])
  detail.current_task_access[0] = { task_id: 30, can_read: false, can_handle: false }
  await render(ref, 'permission-revoked')
  assert.equal(taskButton(), null, 'permission refresh must remove an earlier task action')
  assert.equal(document.querySelector('.erp-workflow-tracking-footer [role="alert"]'), null)
  assert.ok(calls.every((method) => ['get_tracking', 'get_task'].includes(method)))
})
