import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import assert from 'node:assert/strict'
import test from 'node:test'
import { registerJSXTestLoader, installTestDOM } from '../../../../scripts/test/reactRuntime.mjs'

test('only material reviewers have a read-only summary; engineering tasks do not load it', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ default: Entry }, { MemoryRouter }, { JsonRpc }] = await Promise.all([
    import('./EngineeringMaterialTaskSummaryEntry.jsx'), import('react-router-dom'), import('../../../common/utils/jsonRpc.js'),
  ])
  const calls = []
  let escaped = 0
  const original = JsonRpc.prototype.call
  JsonRpc.prototype.call = async function (method, params, options) {
    calls.push({ method, params, options })
    assert.equal(method, 'get_engineering_material_request')
    return { data: { order_no: `ORDER-${params.sales_order_id}`, status: 'BOSS_APPROVED', sources: [], items: [{ id: 1, material_id: 1, unit_id: 1, material_name: '测试布料', unit_name: '码', required_quantity: '3.125' }], issues: [], purchase_orders: [] } }
  }
  const node = document.createElement('div'); document.body.appendChild(node)
  const root = createRoot(node)
  t.after(async () => { await act(async () => root.unmount()); node.remove(); JsonRpc.prototype.call = original; dom.restore() })
  const task = {
    id: 15, source_id: 3, source_type: 'engineering_material_request', task_group: 'engineering_material_finance_review', task_code: 'source-material-finance-review-3', task_status_key: 'ready', owner_role_key: 'finance', required_capability_key: 'engineering.material.finance_approve',
    payload: { sales_order_id: 8, engineering_material_request_id: 3, source_task_contract: 'workflow.source-task/v1', source_task_producer: 'engineering_material_request.approval', source_task_intent_hash: 'a'.repeat(64) },
  }
  const profile = { is_super_admin: true, effective_session: { actions: ['sales_order.read', 'engineering.material.read', 'engineering.material.finance_approve', 'field.procurement_commercial.read'] } }
  let props = { task, profile }
  const render = async (patch = {}) => {
    props = { ...props, ...patch }
    await act(async () => root.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement('div', { onKeyDown: (event) => { if (event.key === 'Escape') escaped++ } }, createElement(Entry, props)))))
  }
  const button = () => node.querySelector('button')
  await render({ task: { id: 9, source_type: 'sales_order', source_id: 8, task_group: 'engineering_data' } })
  assert.equal(button(), null)
  assert.equal(calls.length, 0)
  await render({ task })
  assert.equal(button().textContent.trim(), '查看材料汇总')
  assert.equal(calls.length, 0)
  await act(async () => button().click())
  assert.deepEqual(calls[0].params, { sales_order_id: 8, request_id: 3, preview: false })
  assert.match(document.body.textContent, /测试布料/u)
  assert.match(document.body.textContent, /3\.125/u)
  assert.equal(document.querySelector('.ant-modal-footer'), null)
  assert.equal(document.querySelector('textarea'), null)
  assert.doesNotMatch(document.body.textContent, /批准并生成采购订单|提交老板审核/u)
  await render({ task: { ...task, payload: { ...task.payload, sales_order_id: 11 } } })
  assert.equal(document.querySelector('.erp-material-summary-modal'), null)
  assert.equal(calls[0].options.signal.aborted, true)
  await act(async () => button().click())
  assert.equal(calls.at(-1).params.sales_order_id, 11)
  assert.match(document.body.textContent, /ORDER-11/u)
  assert.doesNotMatch(document.body.textContent, /ORDER-8/u)
  await render({ profile: { permissions: [] } })
  assert.equal(button(), null)
  assert.equal(document.querySelector('.erp-material-summary-modal'), null)
  await render({ profile, task, mobile: true, buttonText: '材料汇总' })
  assert.equal(button().getAttribute('aria-label'), '查看材料汇总')
  await act(async () => button().click())
  await act(async () => button().dispatchEvent(new dom.runtimeWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(escaped, 0)
  assert.equal(document.querySelector('.erp-material-summary-modal'), null)
  await render({ task: { ...task, task_group: 'engineering_material_revision', task_code: 'source-material-revision-3', owner_role_key: 'engineering', required_capability_key: 'engineering.material.submit' } })
  assert.equal(button(), null)
})
