import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'

test('a task business route mounts its source form only after server readback and permission checks', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, router, { default: Layout }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('./MobileTaskBusinessLayout.jsx'), import('../../common/utils/jsonRpc.js'),
  ])
  const task = {
    id: 31,
version: 1,
task_status_key: 'ready',
task_name: '确认材料入库',
    task_group: 'handoff_receipt_inbound',
task_code: 'source-handoff-receipt-inbound-91',
    source_type: 'purchase_receipt',
source_id: 91,
    payload: { source_task_contract: 'workflow.source-task/v1',
source_task_producer: 'fulfillment.source',
      source_record_id: 91,
source_task_intent_hash: 'a'.repeat(64),
entry_path: '/erp/warehouse/inbound?receipt_id=91' },
  }
  let sourceAllowed = true
  let releaseTask
  let sourceMounts = 0
  const calls = []
  const original = JsonRpc.prototype.call
  JsonRpc.prototype.call = async function call(method, params) {
    calls.push([method, params])
    if (method === 'get_task') {
      await new Promise((resolve) => { releaseTask = resolve })
      return { data: { task } }
    }
    if (method === 'explain_action_access') { return { data: {
      source_access: { applicable: true, resolved: true, allowed: sourceAllowed },
      actions: ['complete', 'block', 'reject', 'resume', 'urge'].map((action_key) => ({ action_key, allowed: false })),
    } } }
    throw new Error(`Unexpected RPC: ${method}`)
  }
  function Source() {
    const context = router.useOutletContext()
    React.useEffect(() => { sourceMounts += 1 }, [])
    return createElement('output', { 'data-source-form': true }, `${context.mobileTaskBusiness.taskID}:${context.workflowTaskNavigation.taskID}`)
  }
  let profile = { id: 12, menus: ['/erp/warehouse/inbound'] }
  function Frame() { return createElement(router.Outlet, { context: { adminProfile: profile } }) }
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root
  const mount = async (search = '?receipt_id=91') => {
    root = createRoot(container)
    const sourceRoute = createElement(router.Route, { path: 'warehouse/inbound', element: createElement(Source) })
    const relatedRoute = createElement(router.Route, { path: 'related/inventory', element: createElement(Source) })
    const taskRoute = createElement(router.Route, { path: '/m/:roleKey/tasks/:taskID/handle', element: createElement(Layout) }, sourceRoute, relatedRoute)
    const routes = createElement(router.Routes, null, createElement(router.Route, { element: createElement(Frame) }, taskRoute))
    await act(async () => root.render(createElement(router.MemoryRouter, {
      initialEntries: [search.startsWith('/') ? search : `/m/warehouse/tasks/31/handle/warehouse/inbound${search}`],
      future: { v7_startTransition: true, v7_relativeSplatPath: true },
    }, routes)))
  }
  t.after(async () => { await act(async () => root?.unmount()); JsonRpc.prototype.call = original; container.remove(); dom.restore() })

  await mount()
  assert.equal(sourceMounts, 0)
  await act(async () => releaseTask())
  assert.equal(container.querySelector('[data-source-form]')?.textContent, '31:31')
  assert.equal(sourceMounts, 1)
  assert.deepEqual(calls.map(([method]) => method), ['get_task', 'explain_action_access'])
  await act(async () => root.unmount())

  sourceAllowed = false
  await mount()
  await act(async () => releaseTask())
  assert.equal(container.querySelector('[data-source-form]'), null)
  assert.equal(sourceMounts, 1)
  assert.match(container.textContent, /当前岗位不能办理/u)
  await act(async () => root.unmount())

  sourceAllowed = true
  await mount('?receipt_id=92')
  await act(async () => releaseTask())
  assert.equal(container.querySelector('[data-source-form]'), null)
  assert.match(container.textContent, /此单据与当前任务不匹配/u)
  assert.equal(sourceMounts, 1)
  await act(async () => root.unmount())

  const related = '/m/warehouse/tasks/31/handle/related/inventory'
  await mount(related)
  await act(async () => releaseTask())
  assert.equal(container.querySelector('[data-source-form]'), null)
  assert.equal(sourceMounts, 1)
  assert.match(container.textContent, /当前岗位不能办理/u)
  await act(async () => root.unmount())

  profile = { ...profile, menus: [...profile.menus, '/erp/warehouse/inventory'], permissions: [PermissionCode.WAREHOUSE_ADJUSTMENT_CREATE], effective_session: { actions: [PermissionCode.WAREHOUSE_ADJUSTMENT_CREATE] } }
  await mount(related)
  await act(async () => releaseTask())
  assert.equal(container.querySelector('[data-source-form]')?.textContent, '31:31')
  assert.equal(sourceMounts, 2)
})
