import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'

test('task-contained related navigation preserves list state and ignores the late source after another selection', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, router, { default: useBusinessNavigate }, { default: Layout }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('./useBusinessNavigate.js'), import('../mobile/components/MobileTaskFactLayout.jsx'), import('../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const pending = new Map()
  const calls = []
  const sourceTask = { id: 31, version: 1, source_type: 'outsourcing_order', source_id: 8, owner_role_key: 'quality', task_group: 'business_followup', task_status_key: 'ready' }
  JsonRpc.prototype.call = async function call(method, params) {
    if (method === 'get_task') return { data: { task: sourceTask } }
    if (method === 'explain_action_access') return { data: { source_access: { applicable: true, resolved: true, allowed: true }, actions: ['complete', 'block', 'reject', 'resume', 'urge'].map((action_key) => ({ action_key, allowed: false })) } }
    calls.push([method, params])
    assert.equal(method, 'list_tasks')
    assert.equal(params.source_type, 'quality_inspection')
    return new Promise((resolve) => pending.set(params.source_id, resolve))
  }
  const originalState = { mobileRoleTasksReturn: { adminID: 12, returnListState: { mobileRoleTasksKeyword: '模拟回货单', mobileRoleTasksMainTab: 'todo' } } }
  let openedTask
  let observed
  const context = { taskFactHandling: {
    task: sourceTask,
profile: { id: 12, menus: ['/erp/purchase/processing-contracts'] },
roleKey: 'quality',
    render: ({ content }) => content,
onOpenTask: (task) => { openedTask = task },
onBack() {},
onReceipt() {},
  } }
  function Frame() { return createElement(router.Outlet, { context }) }
  function Page() {
    const navigate = useBusinessNavigate()
    observed = router.useLocation()
    return createElement('div', null, ...[501, 503].map((id) => createElement('button', { key: id, onClick: () => navigate(`/erp/production/quality-inspections?quality_inspection_id=${id}`) }, String(id))))
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); JsonRpc.prototype.call = original; dom.restore() })
  await act(async () => root.render(createElement(router.MemoryRouter, { initialEntries: [{ pathname: '/m/quality/tasks', state: originalState }], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(router.Routes, null, createElement(router.Route, { element: createElement(Frame) }, createElement(router.Route, { path: '/m/quality/tasks', element: createElement(Layout) }, createElement(router.Route, { index: true, element: createElement(Page) })))))))
  const click = async (label) => act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent === label).click())
  const result = (id, taskID) => ({ data: { total: 1,
    tasks: [{ id: taskID,
version: 1,
source_type: 'quality_inspection',
source_id: id,
owner_role_key: 'quality',
task_group: 'handoff_outsourcing_quality',
task_code: `source-handoff-outsourcing-quality-${id}`,
task_status_key: 'ready',
      payload: { source_task_contract: 'workflow.source-task/v1', source_task_producer: 'fulfillment.source', source_record_id: id, source_task_intent_hash: 'a'.repeat(64), entry_path: `/erp/production/quality-inspections?quality_inspection_id=${id}` } }],
  } })
  await click('501')
  await click('503')
  assert.equal(pending.size, 2)
  await act(async () => pending.get(503)(result(503, 52)))
  assert.equal(openedTask.id, 52)
  assert.equal(openedTask.source_id, 503)
  assert.equal(observed.pathname, '/m/quality/tasks')
  assert.equal(observed.search, '')
  assert.deepEqual(observed.state, originalState)
  await act(async () => pending.get(501)(result(501, 51)))
  assert.equal(openedTask.id, 52)
  assert.equal(openedTask.source_id, 503)
  assert.equal(observed.pathname, '/m/quality/tasks')
  assert.deepEqual(observed.state, originalState)
  assert.equal(calls.length, 2)
})
