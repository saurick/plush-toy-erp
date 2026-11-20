import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement } from 'react'
import { createReactTestHarness, installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('任务内表单核对后端来源、岗位与权限，固定办理对象且业务结果不推导任务完成', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, router, { default: Layout }, { default: useParams }, { JsonRpc }, { default: Panels }] = await Promise.all([import('react-dom/client'), import('react-router-dom'), import('./MobileTaskFactLayout.jsx'), import('../../hooks/useBusinessSearchParams.js'), import('../../../common/utils/jsonRpc.js'), import('./MobileTaskStepPanels.jsx')])
  const original = JsonRpc.prototype.call
  let task = { id: 31,
version: 1,
task_status_key: 'ready',
task_group: 'handoff_receipt_inbound',
task_code: 'source-handoff-receipt-inbound-91',
owner_role_key: 'warehouse',
source_type: 'purchase_receipt',
source_id: 91,
    payload: { source_task_contract: 'workflow.source-task/v1', source_task_producer: 'fulfillment.source', source_record_id: 91, source_task_intent_hash: 'a'.repeat(64), entry_path: '/erp/warehouse/inbound?receipt_id=91' } }
  let sourceAllowed = true
  let release
  let first = true
  const calls = []
  JsonRpc.prototype.call = async function call(method) {
    calls.push(method)
    if (method === 'get_task') {
      if (first) { first = false; await new Promise((resolve) => { release = resolve }) }
      return { data: { task } }
    }
    if (method === 'explain_action_access') return { data: { source_access: { applicable: true, resolved: true, allowed: sourceAllowed }, actions: ['complete', 'block', 'reject', 'resume', 'urge'].map((action_key) => ({ action_key, allowed: false, owner_role_matched: true })) } }
    if (method === 'get_purchase_receipt') return { data: { purchase_receipt: { id: 91, status: 'POSTED', items: [{ id: 1, posted: true, lot_id: 7, warehouse_id: 8 }] } } }
    throw new Error(`Unexpected RPC ${method}`)
  }
  const profile = { id: 12, menus: ['/erp/warehouse/inbound'] }
  let receipt
  let leave
  let reads = 0
  let mounts = 0
  let business
  function Frame() {
    const [selected, setSelected] = React.useState(task)
    return createElement(Panels, { scopeKey: `${profile.id}:${selected.id}`, version: selected.version, activeStep: 'action' }, createElement(router.Outlet, { context: { taskFactHandling: { task: selected, profile, roleKey: 'warehouse', registerLeaveGuard: (guard) => { leave = guard }, onTaskRead: (value) => { reads += 1; setSelected(value) }, render: ({ content, footer }) => createElement('div', null, content, footer), onReceipt: (value) => { receipt = value }, onOpenTask: () => {}, onBack: () => {} } } }))
  }
  function Source() {
    const context = router.useOutletContext()
    business = context.taskBusiness
    const [params, setParams] = useParams()
    React.useEffect(() => { mounts += 1 }, [])
    return createElement('div', null, createElement('output', { 'data-source': true, 'data-readonly': context.taskBusiness.readOnly, 'data-lot': params.get('lot_id'), 'data-warehouse': params.get('warehouse_id') }, params.get('receipt_id')), createElement('button', { onClick: () => setParams({ receipt_id: '92', view: 'txns' }) }, '切换参数'), createElement('button', { onClick: () => context.taskBusiness.onResult('实际业务已确认', { id: 91, receipt_no: 'PR-91', status: 'POSTED' }) }, '业务结果'))
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root
  const mount = async () => {
    root = createRoot(container)
    await act(async () => root.render(createElement(router.MemoryRouter, { initialEntries: ['/m/warehouse/tasks'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(router.Routes, null, createElement(router.Route, { path: '/m/warehouse/tasks', element: createElement(Frame) }, createElement(router.Route, { element: createElement(Layout) }, createElement(router.Route, { index: true, element: createElement(Source) })))))))
  }
  t.after(async () => { await act(async () => root?.unmount()); JsonRpc.prototype.call = original; container.remove(); dom.restore() })
  await mount()
  assert.equal(mounts, 0)
  await act(async () => release())
  assert.equal(container.querySelector('[data-source]')?.textContent, '91')
  const click = async (text) => act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === text).click())
  await click('切换参数')
  assert.equal(container.querySelector('[data-source]').textContent, '91')
  const readCount = calls.length
  await act(async () => { business.onBusyChange(true, 'source'); business.onBusyChange(true, 'editor') })
  assert.equal(await leave(), false)
  await act(async () => business.onBusyChange(false, 'source'))
  assert.equal(await leave(), false, 'one source finishing cannot unlock another active editor')
  await act(async () => business.onBusyChange(false, 'editor'))
  await act(async () => { assert.equal(await leave(), true); assert.equal(await leave(), true) })
  assert.equal(calls.length, readCount, 'ordinary step navigation does not request data')
  assert.equal(reads, 0, 'navigation cannot refresh the task list')
  await click('业务结果')
  await click('查看办理结果')
  assert.equal(receipt.task.task_status_key, 'ready')
  assert.equal(receipt.recordNo, 'PR-91')
  assert.equal(calls.filter((method) => method === 'get_task').length, 2)
  assert.ok(calls.every((method) => ['get_task', 'explain_action_access'].includes(method)))
  await act(async () => root.unmount())
  sourceAllowed = false
  await mount()
  assert.equal(container.querySelector('[data-source]'), null)
  await act(async () => root.unmount())
  sourceAllowed = true
  task = { ...task, assignee_id: 13 }
  await mount()
  assert.equal(container.querySelector('[data-source]').textContent, '91')
  assert.equal(container.querySelector('[data-source]').dataset.readonly, 'true')
  assert.equal(mounts, 2)
  await act(async () => root.unmount())
  task = { ...task, task_status_key: 'ready', assignee_id: profile.id }
  profile.menus.push('/erp/warehouse/inventory')
  profile.permissions = ['warehouse.inventory.read']
  profile.effective_session = { actions: ['warehouse.inventory.read'] }
  await mount()
  assert.equal(container.querySelector('[data-source]').dataset.readonly, 'false')
  task = { ...task, version: task.version + 1, task_status_key: 'done' }
  const readsBeforeMode = calls.filter((method) => method === 'get_task').length
  assert.equal([...container.querySelectorAll('button')].some((button) => button.textContent === '核对已入库批次'), false, 'task editing does not add another inventory entry')
  await click('业务结果')
  assert.equal(calls.filter((method) => method === 'get_task').length, readsBeforeMode + 1, 'only an actual business result refreshes the task state')
  assert.equal(container.querySelector('[data-source]').dataset.readonly, 'true')
  assert.equal(container.querySelector('[data-source]').textContent, '91')
  assert.ok(calls.every((method) => ['get_task', 'explain_action_access'].includes(method)))
  await act(async () => root.unmount())
  sourceAllowed = false
  await mount()
  assert.equal(container.querySelector('[data-source]'), null)
  assert.ok(!container.textContent.includes('核对已入库批次'))
})

test('已交接任务先读取真实待执行节点，入账后重读并恢复只读，读取失败可重试', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ MemoryRouter }, { default: Workspace }, { JsonRpc }] = await Promise.all([
    import('react-router-dom'), import('../../components/workflow/WorkflowTaskBusinessWorkspace.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const task = { id: 32, version: 2, task_status_key: 'done', task_group: 'finance_payment_execution', source_type: 'finance_payment', source_id: 92, owner_role_key: 'finance', process_instance_id: 10, process_node_instance_id: 11, discovery: { stage_key: 'payment' } }
  const profile = { id: 12, menus: ['/erp/finance/payments'], permissions: ['finance.payment.read', 'finance.payment.post'], effective_session: { actions: ['finance.payment.read', 'finance.payment.post'] } }
  const completed = { id: 11, process_instance_id: 10, node_key: 'finance_payment_execution', node_type: 'human_task', version: 2, attempt: 1, status: 'completed' }
  const command = { id: 12, process_instance_id: 10, node_key: 'post_finance_payment', node_type: 'domain_command', version: 1, attempt: 1, status: 'active', owner_pool_key: 'finance', required_capability_key: 'finance.payment.post' }
  let processFinished = false
  let fail = false
  let release
  let first = true
  let deferNext = false
  const calls = []
  const original = JsonRpc.prototype.call
  JsonRpc.prototype.call = async function call(method) {
    calls.push(method)
    if (method === 'get_task') return { data: { task } }
    if (method === 'explain_action_access') return { data: { source_access: { applicable: true, resolved: true, allowed: true }, actions: [{ action_key: 'complete', allowed: false, owner_role_matched: true }] } }
    if (method === 'get_task_process_context') {
      if (first || deferNext) { first = false; deferNext = false; await new Promise((resolve) => { release = resolve }) }
      if (fail) throw new Error('simulated process read failure')
      const current = { ...command, status: processFinished ? 'completed' : 'active' }
      return { data: { process_context: { source: { type: task.source_type, id: task.source_id }, process_instance: { id: 10, process_key: 'finance_payment_approval', process_version: 'v1', status: processFinished ? 'completed' : 'active', started_at: 1800000000 }, linked_node: completed, nodes: [completed, current], current_nodes: processFinished ? [] : [current], completed_nodes: processFinished ? [completed, current] : [completed], current_responsibilities: [], approval_form: null } } }
    }
    throw new Error(`Unexpected RPC ${method}`)
  }
  t.after(() => { JsonRpc.prototype.call = original })
  let result
  const controls = { device: 'desktop', task, profile, roleKey: 'finance', render: ({ content, footer }) => createElement('div', null, content, footer) }
  await ui.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Workspace, { controls, renderPage: (context) => { result = context.taskBusiness.onResult; return createElement('output', { 'data-readonly': context.taskBusiness.readOnly }, '本次收付款') } })))
  assert.equal(ui.container.querySelector('output'), null, 'pending process reads cannot enable writes')
  await act(async () => release())
  assert.equal(ui.container.querySelector('output')?.dataset.readonly, 'false')
  const source = ui.container.querySelector('output')
  processFinished = true
  deferNext = true
  await act(async () => result('实际收付已确认', { id: 92, status: 'POSTED' }))
  assert.equal(ui.container.querySelector('output'), source, 'refresh preserves the source page and its in-flight reads')
  assert.equal(source.dataset.readonly, 'true', 'pending process reads disable further writes')
  await act(async () => release())
  assert.equal(ui.container.querySelector('output'), source)
  assert.equal(ui.container.querySelector('output')?.dataset.readonly, 'true')
  fail = true
  await act(async () => result('重新核对', { id: 92, status: 'POSTED' }))
  assert.equal(ui.container.querySelector('output'), source)
  assert.equal(source.dataset.readonly, 'true')
  assert.match(ui.container.textContent, /暂时无法确认/u)
  fail = false
  await act(async () => [...ui.container.querySelectorAll('button')].find((button) => button.textContent === '重新读取').click())
  assert.equal(ui.container.querySelector('output')?.dataset.readonly, 'true')
  assert.ok(calls.every((method) => ['get_task', 'get_task_process_context', 'explain_action_access'].includes(method)))
})
