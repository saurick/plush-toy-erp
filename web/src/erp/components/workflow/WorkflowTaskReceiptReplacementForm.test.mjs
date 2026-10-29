import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('warehouse replacement counting uses the exact existing disposition without purchasing create access', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ App }, { createMemoryRouter, RouterProvider }, { BusinessPageContext }, { default: Editor }, { JsonRpc }] = await Promise.all([
    import('antd'), import('react-router-dom'), import('../../hooks/useBusinessPageContext.js'), import('./WorkflowTaskReceiptReplacementForm.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  t.after(() => { JsonRpc.prototype.call = original })
  const record = { id: 44, version: 1, disposition_no: 'DISP-44', quality_inspection_id: 701, purchase_receipt_id: 31, purchase_receipt_item_id: 32, disposition_type: 'REPLACE', status: 'DRAFT', quantity: '2', reason: '补换不合格面料' }
  const calls = []
  JsonRpc.prototype.call = async (method, params) => {
    calls.push({ method, params })
    if (method === 'get_purchase_rejection_disposition') return { data: { purchase_rejection_disposition: record } }
    assert.equal(method, 'post_purchase_rejection_disposition')
    assert.deepEqual(params, { id: 44, expected_version: 1, counted_quantity: '2' })
    return { data: { purchase_rejection_disposition: { ...record, status: 'POSTED', version: 2, replacement_receipt_id: 51 } } }
  }
  const actionHost = document.createElement('div')
  document.body.appendChild(actionHost)
  t.after(() => actionHost.remove())
  const actions = ['purchase.return.read', 'purchase.return.post', 'purchase.receipt.create']
  const profile = { id: 7, username: 'warehouse-test', effective_session: { actions }, permissions: actions }
  let receipt
  let updateTask
  function Harness() {
    const [task, setTask] = React.useState({ id: 77, version: 1, task_group: 'handoff_receipt_replacement', task_code: 'source-handoff-receipt-replacement-44', source_type: 'purchase_rejection_disposition', source_id: 44, task_status_key: 'ready', owner_role_key: 'warehouse', payload: { source_task_contract: 'workflow.source-task/v1', source_task_producer: 'fulfillment.source', source_record_id: 44, source_task_intent_hash: 'a'.repeat(64), entry_path: '/erp/production/quality-inspections?quality_inspection_id=701' } })
    updateTask = setTask
    return h(App, null, h(BusinessPageContext.Provider, { value: { adminProfile: profile, taskBusiness: { task, readOnly: false, actionHost, navigate: () => {}, onResult: (message, result) => { receipt = { message, result } } } } }, h(Editor)))
  }
  const router = createMemoryRouter([{ path: '/', element: h(Harness) }], { future: { v7_relativeSplatPath: true } })
  t.after(() => router.dispose())
  await ui.render(h(RouterProvider, { router, future: { v7_startTransition: true } }))
  await ui.flush()
  assert.equal(calls.filter((call) => call.method === 'get_purchase_rejection_disposition').length, 1, 'the existing editor reuses the confirmed source record')
  assert.match(actionHost.textContent, /确认处置/u)
  assert.doesNotMatch(actionHost.textContent, /生成处置草稿|继续登记|取消处置/u)
  const input = ui.container.querySelector('input[id$="counted_quantity"]')
  assert.ok(input)
  const fill = (value) => ui.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  await fill('2.1')
  await ui.act(() => [...actionHost.querySelectorAll('button')].find((node) => node.textContent === '确认处置').click())
  assert.equal(document.querySelector('.ant-popconfirm-buttons'), null)
  assert.equal(calls.some((call) => call.method === 'post_purchase_rejection_disposition'), false)
  await fill('2')
  await ui.act(() => [...actionHost.querySelectorAll('button')].find((node) => node.textContent === '确认处置').click())
  await ui.act(() => document.querySelector('.ant-popconfirm-buttons .ant-btn-primary').click())
  assert.equal(calls.filter((call) => call.method === 'post_purchase_rejection_disposition').length, 1)
  assert.equal(receipt.result.id, 44)
  assert.equal(receipt.result.status, 'POSTED')
  assert.equal(calls.some((call) => call.method === 'create_purchase_rejection_disposition'), false)
  await ui.act(() => updateTask((task) => ({ ...task, id: 78, source_id: 45, task_code: 'source-handoff-receipt-replacement-45', payload: { ...task.payload, source_record_id: 45 } })))
  await ui.flush()
  assert.equal(ui.container.querySelector('form'), null, 'a mismatched source response cannot display or edit the previous task')
  assert.match(ui.container.textContent, /重新读取/u)
})
