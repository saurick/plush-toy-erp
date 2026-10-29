import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('手机核对显示完整出货行、数量、单位、仓库和批次，切换来源不残留', async (t) => {
  const ui = await createReactTestHarness(t)
  const { default: Items } = await import('./ShipmentTaskItems.jsx')
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, product_name_snapshot: `产品 ${i + 1}`, product_code_snapshot: `CP-${i + 1}`, quantity: i === 0 ? 0 : 2, warehouse_id: 1, lot_id: 2, unit_id: 3 }))
  await ui.render(h(Items, { shipment: { items }, warehouseOptions: [{ value: 1, label: '成品仓' }], lotOptions: [{ value: 2, label: '批次 A' }], unitOptions: [{ value: 3, label: '个' }] }))
  assert.equal(ui.container.querySelectorAll('article').length, 25)
  assert.match(ui.container.textContent, /产品 25/)
  assert.match(ui.container.textContent, /数量0 个/)
  assert.match(ui.container.textContent, /仓库成品仓/)
  assert.match(ui.container.textContent, /批次批次 A/)
  assert.equal(ui.container.querySelector('input'), null)
  await ui.render(h(Items, { shipment: { items: [] } }))
  assert.equal(ui.container.querySelectorAll('article').length, 0)
  assert.match(ui.container.textContent, /未读取到出货明细/)
})
