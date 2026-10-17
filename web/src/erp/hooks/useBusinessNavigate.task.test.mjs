import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'

test('related mobile task navigation preserves the original filters and ignores a late result after another selection', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, router, { default: useBusinessNavigate }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('./useBusinessNavigate.js'), import('../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const pending = new Map()
  const calls = []
  JsonRpc.prototype.call = async function call(method, params) {
    calls.push([method, params])
    assert.equal(method, 'list_tasks')
    assert.equal(params.source_type, 'quality_inspection')
    return new Promise((resolve) => pending.set(params.source_id, resolve))
  }
  const navigation = { taskID: 31,
adminID: 12,
entryPath: '/m/quality/tasks/31/handle/purchase/processing-contracts?outsourcing_order_id=8&outsourcing_fact_id=91',
    returnPath: '/m/quality/tasks',
returnListState: { mobileRoleTasksKeyword: '模拟回货单', mobileRoleTasksMainTab: 'todo' },
returnHistoryIndex: 7 }
  const profile = { id: 12 }
  const context = { adminProfile: profile, workflowTaskNavigation: navigation, mobileTaskBusiness: { confirmLeave: async () => true } }
  let observed
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
  const entry = new URL(navigation.entryPath, 'https://erp.invalid')
  await act(async () => root.render(createElement(router.MemoryRouter, { initialEntries: [{ pathname: entry.pathname, search: entry.search, state: { workflowTaskNavigation: navigation } }], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(router.Routes, null, createElement(router.Route, { element: createElement(Frame) }, createElement(router.Route, { path: '*', element: createElement(Page) }))))))
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
    payload: { source_task_contract: 'workflow.source-task/v1', source_task_producer: 'fulfillment.source', source_record_id: id, source_task_intent_hash: 'a'.repeat(64), entry_path: `/erp/production/quality-inspections?quality_inspection_id=${id}` } }] } })
  await click('501')
  await click('503')
  assert.equal(pending.size, 2)
  await act(async () => pending.get(503)(result(503, 52)))
  assert.equal(observed.pathname, '/m/quality/tasks/52/handle/production/quality-inspections')
  assert.equal(observed.search, '?quality_inspection_id=503')
  assert.deepEqual(observed.state.workflowTaskNavigation.returnListState, navigation.returnListState)
  assert.equal(observed.state.workflowTaskNavigation.returnHistoryIndex, 7)
  await act(async () => pending.get(501)(result(501, 51)))
  assert.equal(observed.state.workflowTaskNavigation.taskID, 52)
  assert.equal(observed.search, '?quality_inspection_id=503')
  assert.equal(calls.length, 2)
})
