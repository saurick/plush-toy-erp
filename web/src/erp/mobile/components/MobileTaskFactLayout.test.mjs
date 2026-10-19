import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('任务内表单核对后端来源、岗位与权限，固定办理对象且业务结果不推导任务完成', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, router, { default: Layout }, { default: useParams }, { JsonRpc }] = await Promise.all([import('react-dom/client'), import('react-router-dom'), import('./MobileTaskFactLayout.jsx'), import('../../hooks/useBusinessSearchParams.js'), import('../../../common/utils/jsonRpc.js')])
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
    if (method === 'explain_action_access') return { data: { source_access: { applicable: true, resolved: true, allowed: sourceAllowed }, actions: ['complete', 'block', 'reject', 'resume', 'urge'].map((action_key) => ({ action_key, allowed: false })) } }
    throw new Error(`Unexpected RPC ${method}`)
  }
  const profile = { id: 12, menus: ['/erp/warehouse/inbound'] }
  let receipt
  let mounts = 0
  function Frame() {
    return createElement(router.Outlet, { context: { taskFactHandling: { task, profile, roleKey: 'warehouse', render: ({ content, footer }) => createElement('div', null, content, footer), onReceipt: (value) => { receipt = value }, onOpenTask: () => {}, onBack: () => {} } } })
  }
  function Source() {
    const context = router.useOutletContext()
    const [params, setParams] = useParams()
    React.useEffect(() => { mounts += 1 }, [])
    return createElement('div', null, createElement('output', { 'data-source': true }, params.get('receipt_id')), createElement('button', { onClick: () => setParams({ receipt_id: '92', view: 'txns' }) }, '切换参数'), createElement('button', { onClick: () => context.mobileTaskBusiness.onResult('实际业务已确认', { id: 91, receipt_no: 'PR-91', status: 'POSTED' }) }, '业务结果'))
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
  await click('业务结果')
  await click('查看办理结果')
  assert.equal(receipt.task.task_status_key, 'ready')
  assert.equal(receipt.recordNo, 'PR-91')
  assert.deepEqual(calls, ['get_task', 'explain_action_access', 'get_task'])
  await act(async () => root.unmount())
  sourceAllowed = false
  await mount()
  assert.equal(container.querySelector('[data-source]'), null)
  await act(async () => root.unmount())
  sourceAllowed = true
  task = { ...task, assignee_id: 13 }
  await mount()
  assert.equal(container.querySelector('[data-source]'), null)
  assert.equal(mounts, 1)
})
