import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

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

test('多任务选择清空后保留入口，禁用办理且不读取或打开旧任务', async (t) => {
  const tasks = [task, { ...task, task_id: 31, task_name: '核对订单' }]
  const calls = []
  const harness = await businessFormHarness(t, { rpc: async (method) => {
    calls.push(method)
    return { data: { tracking: { ...detail, summary: { ...detail.summary, current_tasks: tasks }, tasks, current_task_access: tasks.map(({ task_id }) => ({ task_id, can_read: true, can_handle: true })) } } }
  } })
  const { default: Drawer } = await import('./WorkflowTrackingDrawer.jsx')
  await harness.render(createElement(Drawer, { trackingRef: { kind: 'process', id: 10 }, onClose() {}, onOpenTask() { assert.fail('清空不得打开任务') } }))
  const input = document.querySelector('.erp-workflow-tracking-footer [role="combobox"]')
  await act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  await harness.click(document.querySelector('.ant-select-item-option'))
  const button = () => document.querySelector('.erp-workflow-tracking-open-task')
  assert.equal(button().disabled, false)
  await act(() => input.closest('.ant-select').querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  assert.equal(button().disabled, true)
  assert.match(button().textContent, /选择任务后继续/u)
  assert.ok(input.closest('.ant-select').querySelector('.ant-select-selection-placeholder'))
  assert.deepEqual(calls, ['get_tracking'])
})

test('tracking hides unauthorized entries, keeps footer actions separate and cancels stale opens', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Drawer }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowTrackingDrawer.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const calls = []
  const opened = []
  let closed = 0
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
  const render = (ref, refreshKey = 'session-one', closeLabel = '返回列表') => act(async () => root.render(createElement(Drawer, { trackingRef: ref, refreshKey, closeLabel, onClose() { closed += 1 }, onOpenTask: (value) => opened.push(value) })))
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
  const backButton = document.querySelector('.ant-drawer-header button')
  assert.equal(backButton.getAttribute('aria-label'), '返回列表')
  assert.ok(backButton.querySelector('.anticon-left'))
  assert.equal(document.querySelector('.anticon-close'), null)
  assert.doesNotMatch(document.querySelector('.ant-drawer-footer').textContent, /返回列表/)
  await act(async () => backButton.click())
  assert.equal(closed, 1, 'header back returns to the caller')
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
  await render(ref, 'permission-revoked', '返回任务')
  assert.equal(document.querySelector('.ant-drawer-header button').getAttribute('aria-label'), '返回任务')
  assert.equal(taskButton(), null, 'permission refresh must remove an earlier task action')
  assert.equal(document.querySelector('.erp-workflow-tracking-footer [role="alert"]'), null)
  assert.ok(calls.every((method) => ['get_tracking', 'get_task'].includes(method)))
})

test('tracking exceptions load only when expanded, keep exact scope and cancel stale reads', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Drawer }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowTrackingDrawer.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const calls = []
  let mode = 'failure'
  let pending
  JsonRpc.prototype.call = async (method, params, options) => {
    calls.push({ method, params, options })
    if (method === 'get_tracking') return { data: { tracking: { ...detail, summary: { ...detail.summary, id: params.id }, nodes: detail.nodes.map((node) => ({ ...node, process_instance_id: params.id })) } } }
    assert.equal(method, 'list_exceptions')
    if (mode === 'failure') throw new Error('unavailable')
    const data = { items: mode === 'empty' ? [] : [{ key: 'quality:1', number: 'EX-CONTEXT', state: 'open', tasks: [], task_ids: [], orders: [] }], tasks: [], orders: [], total: mode === 'empty' ? 0 : 1, view_total: mode === 'empty' ? 0 : 1, pending_tasks: 0, affected_orders: 0, open: 1, closed: 0 }
    if (mode === 'pending') return new Promise((resolve) => { pending = { signal: options.signal, resolve: () => resolve({ data }) } })
    return { data }
  }
  const node = document.createElement('div')
  document.body.appendChild(node)
  const root = createRoot(node)
  t.after(async () => { await act(async () => root.unmount()); node.remove(); JsonRpc.prototype.call = original; dom.restore() })
  const render = (ref) => act(async () => root.render(createElement(Drawer, { trackingRef: ref, onClose() {} })))
  const expand = async () => act(async () => {
    const details = document.querySelector('.erp-workflow-tracking-exceptions')
    details.open = true
    details.dispatchEvent(new Event('toggle'))
  })
  const ref = { kind: 'process', id: 10 }
  await render(ref)
  assert.equal(document.querySelector('.erp-workflow-tracking-exceptions').open, false)
  assert.equal(calls.filter(({ method }) => method === 'list_exceptions').length, 0)
  await expand()
  const panel = () => document.querySelector('.erp-workflow-tracking-exceptions .workflow-exceptions')
  assert.ok(panel().querySelector('[role="alert"]'), 'load failure must not look like no incidents')
  assert.deepEqual(calls.at(-1).params, { tracking_kind: 'process', tracking_id: 10, limit: 20, offset: 0 })
  assert.equal(panel().querySelector('.workflow-exceptions__query'), null)
  assert.equal(panel().querySelector('.workflow-exceptions__states'), null)
  assert.equal(panel().querySelector('.workflow-exceptions__summary'), null)
  mode = 'success'
  await act(async () => [...panel().querySelectorAll('button')].find((button) => /重\s*试/u.test(button.textContent)).click())
  assert.match(panel().textContent, /EX-CONTEXT/u)
  await render({ kind: 'process', id: 11 })
  assert.equal(document.querySelector('.erp-workflow-tracking-exceptions').open, false)
  assert.doesNotMatch(document.querySelector('.erp-workflow-tracking-detail').textContent, /EX-CONTEXT/u)
  mode = 'empty'
  await expand()
  assert.equal(calls.at(-1).params.tracking_id, 11)
  assert.match(panel().textContent, /本流程暂无可见异常/u)
  await render(ref)
  mode = 'pending'
  await expand()
  await render(null)
  assert.equal(pending.signal.aborted, true)
  await act(async () => pending.resolve())
  await render(ref)
  assert.equal(panel(), null)
})
