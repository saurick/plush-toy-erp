import { createElement as h } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../../scripts/test/rpcApiTestHarness.mjs'
import { PurchaseSourceActions } from '../../../common/consts/purchaseSourceActions.mjs'
import { RpcErrorCode } from '../../../common/consts/errorCodes.generated.js'

const source = { id: 7, purchase_order_no: 'PO-PERMISSION' }
const progress = { code: 0,
data: { purchase_order_receipt_progress: {
  purchase_order_id: source.id, purchase_order_no: source.purchase_order_no, lifecycle_status: 'approved', items: [],
} } }
const draft = { receipt_no: 'IN-PERMISSION',
received_at: '2026-10-25',
arrival_items: [
  { purchase_order_item_id: 10, warehouse_id: 20, quantity: '2', declared_quantity: '2' },
] }

async function harness(t, respond) {
  const view = await createReactTestHarness(t)
  const [{ usePurchaseOrderInboundDraft }, { MemoryRouter, Route, Routes, Outlet }] = await Promise.all([
    import('./usePurchaseOrderInboundDraft.mjs'), import('react-router-dom'),
  ])
  const action = PurchaseSourceActions.receipt
  const permissions = [action.permission, ...action.sourcePermissions, ...action.preparationPermissions]
  let profile = { permissions, effective_session: { actions: permissions } }
  let values = {}; let
current
  const calls = []
  installRpcCallHarness((cleanup) => t.after(cleanup))(async (method, params, context) => {
    calls.push({ method, params, signal: context.init.signal })
    return respond(method, params)
  })
  const form = {
    resetFields: () => { values = {} },
    setFieldsValue: (next) => { values = { ...values, ...next } },
    setFieldValue: (key, value) => { values[key] = value },
    validateFields: async () => values,
  }
  const navigate = () => {}
  function Consumer() {
    current = usePurchaseOrderInboundDraft({ form, navigate, selectedOrder: source })
    return null
  }
  function Frame() { return h(Outlet, { context: { adminProfile: profile } }) }
  const render = () => view.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Routes, null, h(Route, { element: h(Frame) }, h(Route, { path: '*', element: h(Consumer) })))))
  await render()
  return { ...view,
calls,
form,
render,
    get current() { return current },
get values() { return values },
    revoke: () => { profile = { ...profile, effective_session: { actions: [action.permission] } }; return render() },
  }
}

test('到货窗口在来源撤权后关闭、取消待读取并拒绝迟到结果', async (t) => {
  let resolve
  const pending = new Promise((done) => { resolve = done })
  const view = await harness(t, () => pending)
  let opening
  await view.act(() => { opening = view.current.openInboundDraftModal(source) })
  assert(view.current.inboundDraftModalOpen)
  assert.equal(view.calls.length, 1)
  await view.revoke()
  assert(!view.current.inboundDraftModalOpen)
  assert(view.calls[0].signal.aborted)
  assert.deepEqual(view.values, {})
  await view.act(async () => { resolve(progress); await opening })
  assert.deepEqual(view.current.inboundDraftPreviewRows, [])
  assert.deepEqual(view.values, {})
  await view.act(() => view.current.openInboundDraftModal(source))
  assert.equal(view.calls.length, 1)
})

test('到货提交被后端拒绝权限后清空窗口，不保留可提交来源', async (t) => {
  const view = await harness(t, (method) => method === 'get_purchase_order_receipt_progress'
    ? progress : { code: RpcErrorCode.PERMISSION_DENIED, message: '权限不足' })
  await view.act(() => view.current.openInboundDraftModal(source))
  view.form.setFieldsValue(draft)
  await view.act(() => view.current.createInboundDraftFromOrder())
  assert(!view.current.inboundDraftModalOpen)
  assert.deepEqual(view.values, {})
  assert.equal(view.calls.filter((call) => call.method === 'create_purchase_receipt_from_purchase_order').length, 1)
})

test('到货提交结果未知保留窗口与同一幂等请求，不能被权限清理误伤', async (t) => {
  const view = await harness(t, (method) => {
    if (method === 'get_purchase_order_receipt_progress') return progress
    throw new TypeError('Failed to fetch')
  })
  await view.act(() => view.current.openInboundDraftModal(source))
  view.form.setFieldsValue(draft)
  await view.act(() => view.current.createInboundDraftFromOrder())
  assert(view.current.inboundDraftModalOpen)
  await view.act(() => view.current.createInboundDraftFromOrder())
  const writes = view.calls.filter((call) => call.method === 'create_purchase_receipt_from_purchase_order')
  assert.equal(writes.length, 2)
  assert(writes[0].params.idempotency_key)
  assert.deepEqual(writes[0].params, writes[1].params)
  assert(view.current.inboundDraftModalOpen)
})
