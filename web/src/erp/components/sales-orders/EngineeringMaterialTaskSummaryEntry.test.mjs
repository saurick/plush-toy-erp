import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../../scripts/test/reactRuntime.mjs'

test('task summary loads on demand, stays read-only and clears on source or access change', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ default: Entry }, { MemoryRouter }, { JsonRpc }] = await Promise.all(
    [
      import('./EngineeringMaterialTaskSummaryEntry.jsx'),
      import('react-router-dom'),
      import('../../../common/utils/jsonRpc.js'),
    ]
  )
  const calls = []
  const originalCall = JsonRpc.prototype.call
  JsonRpc.prototype.call = async function call(method, params, options) {
    calls.push({ method, params, options })
    assert.equal(method, 'get_engineering_material_request')
    return {
      data: {
        order_no: `ORDER-${params.sales_order_id}`,
        status: params.request_id ? 'BOSS_APPROVED' : 'PREVIEW',
        sources: [],
        items: [
          {
            id: 1,
            material_id: 1,
            unit_id: 1,
            material_name: '测试布料',
            unit_name: 'Y',
            required_quantity: '3.125',
          },
        ],
        issues: ['请先补齐订单工程资料'],
        purchase_orders: [],
      },
    }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const task = {
    id: 9,
    source_id: 8,
    source_type: 'sales_order',
    task_group: 'engineering_data',
    task_status_key: 'ready',
  }
  const profile = {
    is_super_admin: true,
    effective_session: {
      actions: [
        'sales_order.read',
        'engineering.material.read',
        'engineering.material.submit',
        'engineering.material.boss_approve',
        'engineering.material.finance_approve',
        'field.procurement_commercial.read',
      ],
    },
  }
  let props = { task, profile }
  const render = async (patch = {}) => {
    props = { ...props, ...patch }
    await act(async () =>
      root.render(
        createElement(
          MemoryRouter,
          { future: { v7_startTransition: true, v7_relativeSplatPath: true } },
          createElement(Entry, props)
        )
      )
    )
  }
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (node) => node.textContent.trim() === label
    )
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    JsonRpc.prototype.call = originalCall
    dom.restore()
  })
  await render()
  assert(button('查看材料汇总'))
  assert.equal(calls.length, 0)
  await act(async () => button('查看材料汇总').click())
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].params, { sales_order_id: 8, preview: false })
  assert.match(document.body.textContent, /ORDER-8/u)
  assert.match(document.body.textContent, /尚未提交审批/u)
  assert.equal(button('提交老板审核'), undefined)
  assert.equal(button('批准并生成采购订单'), undefined)

  await render({ task: { ...task, source_id: 11 } })
  assert.equal(document.querySelector('.erp-material-summary-modal'), null)
  assert.equal(calls[0].options.signal.aborted, true)
  assert.equal(calls.length, 1)
  await act(async () => button('查看材料汇总').click())
  assert.equal(calls.at(-1).params.sales_order_id, 11)
  assert.match(document.body.textContent, /ORDER-11/u)
  assert.doesNotMatch(document.body.textContent, /ORDER-8/u)

  await render({ profile: { permissions: [] } })
  assert.equal(button('查看材料汇总'), undefined)
  assert.equal(document.querySelector('.erp-material-summary-modal'), null)
  assert.equal(calls.at(-1).options.signal.aborted, true)
  await render({ profile })
  assert.equal(document.querySelector('.erp-material-summary-modal'), null)
  assert.equal(calls.length, 2)

  const approvalTask = {
    id: 15,
    source_id: 3,
    source_type: 'engineering_material_request',
    task_group: 'engineering_material_finance_review',
    task_code: 'source-material-finance-review-3',
    task_status_key: 'ready',
    owner_role_key: 'finance',
    required_capability_key: 'engineering.material.finance_approve',
    payload: {
      sales_order_id: 8,
      engineering_material_request_id: 3,
      source_task_contract: 'workflow.source-task/v1',
      source_task_producer: 'engineering_material_request.approval',
      source_task_intent_hash: 'a'.repeat(64),
    },
  }
  await render({ task: approvalTask, mobile: true })
  assert.equal(
    calls.length,
    2,
    'entering an approval task must not load the summary'
  )
  await act(async () => button('查看材料汇总').click())
  assert.deepEqual(calls.at(-1).params, {
    sales_order_id: 8,
    request_id: 3,
    preview: false,
  })
  assert.equal(document.querySelector('.ant-modal-footer'), null)
  assert.equal(document.querySelector('input[aria-label="单价 1"]'), null)
  assert.equal(document.querySelector('textarea'), null)
  assert.equal(document.querySelector('[role="switch"]'), null)
  assert.equal(document.querySelector('input[type="search"]'), null)
  assert.equal(button('批准并生成采购订单'), undefined)
  assert.equal(button('退回工程'), undefined)
  assert.match(document.body.textContent, /测试布料/u)
  assert.match(document.body.textContent, /3.13/u)
  assert.ok(
    calls.every(({ method }) => method === 'get_engineering_material_request')
  )
})
