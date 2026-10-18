import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import {
  businessFormHarness,
  deferredFormRequest,
} from '../../../../scripts/test/businessFormHarness.mjs'

const permissions = [PermissionCode.SALES_ORDER_READ, PermissionCode.PURCHASE_ORDER_READ, PermissionCode.OUTSOURCING_ORDER_READ]

function page(key, rows) {
  return { data: { [key]: rows, total: rows.length, limit: 200, offset: 0 } }
}

async function setup(t, rpc, initial = {}) {
  const calls = []
  const ui = await businessFormHarness(t, {
    rpc(method, params, options) {
      calls.push({ method, params, options })
      return rpc(method, params, options)
    },
  })
  const [{ Form, Input }, { default: Fields }] = await Promise.all([
    import('antd'),
    import('./FinancePaymentSourceFields.jsx'),
  ])
  const props = {
    open: true,
    profile: { permissions, effective_session: { actions: permissions } },
  }
  let form
  function PaymentForm() {
    [form] = Form.useForm()
    return createElement(Form, {
      form,
      initialValues: { kind: 'ADVANCE', direction: 'RECEIPT', counterparty_id: 7, source_type: 'sales_order', ...initial },
    }, ...['kind', 'direction', 'counterparty_id', 'currency'].map((name) =>
      createElement(Form.Item, { key: name, name, hidden: true }, createElement(Input))
    ), createElement(Fields, { ...props, form }))
  }
  return {
    ...ui,
    props,
    calls,
    values: () => form.getFieldsValue(true),
    async set(values) {
      await act(async () => form.setFieldsValue(values))
      await ui.flush()
    },
    render: () => ui.render(createElement(PaymentForm)),
  }
}

test('advance receipt requires both read permission and an effective session before fetching orders', async (t) => {
  const ui = await setup(t, () => page('sales_orders', []))
  ui.props.profile = { permissions, effective_session: { actions: [] } }
  await ui.render()
  assert.equal(ui.calls.length, 0)
  assert.match(document.body.textContent, /当前账号不能读取该类订单/u)
  ui.props.profile = { permissions: [], effective_session: { actions: permissions } }
  await ui.render()
  assert.equal(ui.calls.length, 0)
  ui.props.profile = { permissions, effective_session: { actions: permissions } }
  await ui.render()
  assert.equal(ui.calls.length, 1)
  assert.equal(ui.calls[0].method, 'list_sales_orders')
  assert.deepEqual(ui.calls[0].params, { lifecycle_status: 'active', customer_id: 7, limit: 200, offset: 0 })
  assert.doesNotMatch(document.body.textContent, /当前账号不能读取该类订单/u)
})

test('advance payment filters eligible supplier orders and clears the old order and currency on source change', async (t) => {
  const originalError = console.error
  const errors = t.mock.method(console, 'error', (...args) => originalError(...args))
  const ui = await setup(t, (method) => {
    if (method === 'list_purchase_orders') {
      return page('purchase_orders', [
        { id: 11, purchase_order_no: 'PO-11', supplier_id: 7, lifecycle_status: 'approved', currency: 'USD' },
        { id: 12, purchase_order_no: 'WRONG-PARTY', supplier_id: 8, lifecycle_status: 'approved', currency: 'CNY' },
        { id: 13, purchase_order_no: 'DRAFT-ORDER', supplier_id: 7, lifecycle_status: 'draft', currency: 'CNY' },
      ])
    }
    assert.equal(method, 'list_outsourcing_orders')
    return page('outsourcing_orders', [
      { id: 21, outsourcing_order_no: 'OUT-21', supplier_id: 7, lifecycle_status: 'confirmed', currency: 'HKD' },
      { id: 22, outsourcing_order_no: 'CANCELLED', supplier_id: 7, lifecycle_status: 'cancelled', currency: 'CNY' },
    ])
  }, { direction: 'DISBURSEMENT', source_type: 'purchase_order' })
  await ui.render()
  assert.deepEqual((await ui.options('订单 / 合同')).map((node) => node.textContent), ['PO-11 · USD'])
  await ui.select('订单 / 合同', 'PO-11 · USD')
  assert.equal(ui.values().source_id, 11)
  assert.equal(ui.values().currency, 'USD')
  await ui.select('关联单据', '委外合同')
  assert.equal(ui.values().source_id, undefined)
  assert.equal(ui.values().currency, undefined)
  assert.deepEqual((await ui.options('订单 / 合同')).map((node) => node.textContent), ['OUT-21 · HKD'])
  await ui.select('订单 / 合同', 'OUT-21 · HKD')
  assert.equal(ui.values().source_id, 21)
  assert.equal(ui.values().currency, 'HKD')
  assert.equal(ui.calls.length, 2)
  assert.deepEqual(ui.calls.map(({ params }) => [params.supplier_id, params.lifecycle_status]), [[7, 'approved'], [7, 'confirmed']])
  assert.equal(errors.mock.callCount(), 0, 'source switching must not relabel a selected order with another source schema')
})

test('changing the counterparty aborts the previous request and ignores its late response', async (t) => {
  const old = deferredFormRequest()
  const ui = await setup(t, (_, params) => params.customer_id === 7 ? old.promise : page('sales_orders', [
    { id: 31, order_no: 'CURRENT-CUSTOMER', customer_id: 8, lifecycle_status: 'active', currency: 'CNY' },
  ]))
  await ui.render()
  assert.equal(ui.calls.length, 1)
  await ui.set({ counterparty_id: 8 })
  assert.equal(ui.calls[0].options.signal.aborted, true)
  await act(async () => old.resolve(page('sales_orders', [
    { id: 30, order_no: 'STALE-CUSTOMER', customer_id: 7, lifecycle_status: 'active', currency: 'USD' },
  ])))
  await ui.flush()
  assert.deepEqual((await ui.options('订单 / 合同')).map((node) => node.textContent), ['CURRENT-CUSTOMER · CNY'])
  await ui.select('订单 / 合同', 'CURRENT-CUSTOMER · CNY')
  assert.equal(ui.values().currency, 'CNY')
})

test('a failed source load can recover on reopening without fetching for a settlement', async (t) => {
  let attempts = 0
  const ui = await setup(t, () => {
    if (++attempts === 1) throw new Error('internal source lookup detail')
    return page('sales_orders', [
      { id: 41, order_no: 'RECOVERED', customer_id: 7, lifecycle_status: 'active', currency: 'CNY' },
    ])
  })
  await ui.render()
  assert.match(document.body.textContent, /读取可收付订单/u)
  assert.doesNotMatch(document.body.textContent, /internal source lookup detail/u)
  ui.props.open = false
  await ui.render()
  assert.equal(attempts, 1)
  ui.props.open = true
  await ui.render()
  assert.equal(attempts, 2)
  assert.doesNotMatch(document.body.textContent, /读取可收付订单/u)
  await ui.select('订单 / 合同', 'RECOVERED · CNY')
  await ui.set({ kind: 'SETTLEMENT' })
  assert.doesNotMatch(document.body.textContent, /订单 \/ 合同/u)
  assert.equal(attempts, 2)
})
