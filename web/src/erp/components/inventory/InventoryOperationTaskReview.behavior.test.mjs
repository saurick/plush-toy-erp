import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { businessFormHarness, deferredFormRequest } from '../../../../scripts/test/businessFormHarness.mjs'

test('inventory review blocks approval until matching complete lines are readable and supports retry', async (t) => {
  const request = deferredFormRequest()
  let attempts = 0
  const readiness = []
  const ui = await businessFormHarness(t, {
    rpc(method) {
      assert.equal(method, 'get_inventory_operation')
      if (++attempts === 1) return request.promise
      return { data: { inventory_operation: { id: 17,
operation_type: 'CYCLE_COUNT',
operation_no: 'COUNT-17',
reason: '月末复核',
items: [
        { id: 1, subject_name: '测试材料', sku_code: '', warehouse_name: '材料仓', unit_name: '米', lot_no: 'LOT-7', expected_quantity: '10', counted_quantity: '10', adjustment_quantity: '0' },
        { id: 2, subject_name: '测试成品', sku_code: 'SKU-BLUE', warehouse_name: '成品仓', unit_name: '个', expected_quantity: '5', counted_quantity: '3', adjustment_quantity: '-2' },
      ] } } }
    },
  })
  const { default: Review } = await import('./InventoryOperationTaskReview.jsx')
  const props = { task: { source_type: 'inventory_operation', source_id: 17 }, onReady: (id) => readiness.push(id) }
  await ui.render(createElement(Review, props))
  assert.deepEqual(readiness, [0])
  request.resolve({ data: { inventory_operation: { id: 18, items: [] } } })
  await t.waitFor(async () => { await ui.flush(); assert.match(document.body.textContent, /重新读取/u) })
  assert.equal(readiness.includes(17), false)
  await ui.click(ui.button('重新读取'))
  await t.waitFor(async () => { await ui.flush(); assert.equal(readiness.at(-1), 17) })
  for (const text of ['COUNT-17', '材料仓', 'LOT-7', 'SKU-BLUE', '账面数量', '实盘数量', '差异数量', '零差异']) assert.ok(document.body.textContent.includes(text), text)
})
