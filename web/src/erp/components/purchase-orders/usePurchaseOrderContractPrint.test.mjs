import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../../scripts/test/rpcApiTestHarness.mjs'

test('contract printing reads only source reference IDs and preserves frozen names while filling historical gaps', async (t) => {
  const view = await createReactTestHarness(t)
  const setHandler = installRpcCallHarness((cleanup) => t.after(cleanup))
  const calls = []
  const order = { id: 9, version: 3, supplier_id: 7, purchase_order_no: 'PO-HISTORY', supplier_snapshot: { name: '冻结供应商' } }
  const lines = [
    { id: 1, material_id: 10, material_name_snapshot: '冻结材料', unit_id: 3, purchased_quantity: '5', unit_price: '2' },
    { id: 2, material_id: 20, unit_id: 3, purchased_quantity: '6', unit_price: '3' },
  ]
  setHandler(async (method, params) => {
    calls.push({ method, params })
    if (method === 'get_purchase_order') return { code: 0, data: { purchase_order: order } }
    const [key, records] = {
      list_purchase_order_items: ['purchase_order_items', lines],
      list_materials: ['materials', [{ id: 10, name: '实时材料', is_active: false }, { id: 20, name: '历史停用材料', is_active: false }]],
      list_units: ['units', [{ id: 3, name: '只', is_active: false }]],
      list_suppliers: ['suppliers', [{ id: 7, name: '实时供应商', is_active: false }]],
    }[method] || []
    assert.ok(key, method)
    return { code: 0, data: { [key]: records, total: records.length, limit: params.limit, offset: params.offset } }
  })
  const { usePurchaseOrderContractPrint } = await import('./usePurchaseOrderContractPrint.mjs')
  const { buildPrintWorkspaceDraftStorageKey, readPrintWorkspaceDraftSnapshot, MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY } = await import('../../utils/printWorkspace.js')
  const { message } = await import('../../../common/utils/antdApp.js')
  const oldError = message.error
  const errors = []
  message.error = (error) => errors.push(error)
  t.after(() => { message.error = oldError })
  let openedURL
  const browserWindow = window
  const oldOpen = browserWindow.open
  browserWindow.open = (url) => { openedURL = url; return { focus() {} } }
  t.after(() => { browserWindow.open = oldOpen })
  let print
  function Consumer() {
    print = usePurchaseOrderContractPrint({ customerKey: 'demo', accountKey: '42', configRevision: 'test', resolveSupplierSnapshot: async () => ({ name: '实时供应商', address: '补全地址' }) })
    return null
  }
  await view.render(createElement(Consumer))
  await view.act(async () => print.printPurchaseContract({ id: 9, version: 1 }))
  assert.deepEqual(errors, [])
  assert.ok(openedURL)
  assert.equal(calls.find((call) => call.method === 'list_purchase_order_items').params.purchase_order_id, 9)
  for (const [method, ids] of [['list_materials', [10, 20]], ['list_units', [3]], ['list_suppliers', [7]]]) {
    const requests = calls.filter((call) => call.method === method)
    assert.equal(requests.length, 1)
    assert.deepEqual(requests[0].params.ids, ids)
    assert.equal(requests[0].params.active_only, undefined)
  }
  const stateID = new URL(openedURL, window.location.href).searchParams.get('state')
  const key = buildPrintWorkspaceDraftStorageKey(MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY, stateID, { customerKey: 'demo', accountKey: '42', configRevision: 'test', windowLike: window })
  const draft = readPrintWorkspaceDraftSnapshot(key, window.localStorage)
  assert.equal(draft.contractNo, 'PO-HISTORY')
  assert.equal(draft.supplierName, '冻结供应商')
  assert.equal(draft.supplierAddress, '补全地址')
  assert.deepEqual(draft.lines.map((line) => line.materialName), ['冻结材料', '历史停用材料'])
  assert.deepEqual(draft.lines.map((line) => line.quantity), ['5', '6'])
  assert.equal(print.printingContract, false)
})
