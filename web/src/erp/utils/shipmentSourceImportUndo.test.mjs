import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canUndoShipmentSourceImport,
  createShipmentSourceImportUndo,
} from './shipmentSourceImportUndo.mjs'

const original = () => ({
  sales_order_id: undefined,
  customer_id: 6,
  customer_snapshot: '原客户',
  delivery_country_region: '中国',
  delivery_recipient: '原收货人',
  delivery_phone: '',
  delivery_address: '原地址',
  items: [{ product_id: 8, warehouse_id: 2, lot_id: 3, quantity: '2', note: '原行备注' }],
  total_net_weight_g: '200',
  total_net_weight_items_signature: '原明细签名',
  note: '单据备注',
})
const imported = (before) => ({
  ...before,
  sales_order_id: 12,
  customer_id: 7,
  customer_snapshot: '来源客户',
  delivery_recipient: '来源收货人',
  delivery_address: '来源地址',
  items: [...before.items, { sales_order_item_id: 21, product_id: 9, quantity: '10' }],
  total_net_weight_g: undefined,
  total_net_weight_items_signature: undefined,
})

test('undo restores source, delivery, existing rows and their manual weight while preserving unrelated edits', () => {
  const before = original()
  const after = imported(before)
  const undo = createShipmentSourceImportUndo(before, after)
  const current = { ...after, note: '后续备注', planned_ship_at: '2026-10-30', transport_method: '陆运' }
  assert.equal(canUndoShipmentSourceImport(undo, current), true)
  const restored = { ...current, ...undo.values }
  for (const key of Object.keys(undo.values)) assert.deepEqual(restored[key], before[key], key)
  assert.equal(Object.hasOwn(restored, 'sales_order_id'), true)
  assert.equal(restored.sales_order_id, undefined, '显式恢复空关联，不能留下导入来源')
  assert.equal(restored.note, '后续备注')
  assert.equal(restored.planned_ship_at, '2026-10-30')
  assert.equal(restored.transport_method, '陆运')
  before.items[0].quantity = '99'
  assert.equal(undo.values.items[0].quantity, '2', '快照不得随表单对象改变')
})

test('editing source rows, delivery, currency-dependent freight or weight blocks stale undo', () => {
  const after = imported(original())
  const undo = createShipmentSourceImportUndo(original(), after)
  const changes = [
    ['sales_order_id', 99], ['customer_id', 99], ['customer_snapshot', '改过的客户'],
    ['delivery_country_region', '另一区域'], ['delivery_recipient', '另一个人'],
    ['delivery_phone', '待核对'], ['delivery_address', '另一个地址'],
    ['freight_amount', '20'], ['total_net_weight_g', '99'],
    ['total_net_weight_items_signature', '另一个签名'],
    ['items', after.items.slice(1)], ['items', [...after.items, { product_id: 11 }]],
  ]
  for (const field of ['quantity', 'warehouse_id', 'lot_id', 'product_id', 'unit_id', 'note']) {
    changes.push(['items', after.items.map((row, index) => index ? { ...row, [field]: 'changed' } : row)])
  }
  for (const [key, value] of changes) {
    assert.equal(canUndoShipmentSourceImport(undo, { ...after, [key]: value }), false, key)
  }
  assert.equal(canUndoShipmentSourceImport({ ...undo, invalidated: true }, after), false, '改回原值也不重新开放已失效的撤销')
  assert.equal(canUndoShipmentSourceImport(null, after), false)
})

test('a second import can only restore its immediate predecessor, including earlier imported rows', () => {
  const before = original()
  const first = imported(before)
  const second = { ...first, items: [...first.items, { sales_order_item_id: 22, quantity: '3' }] }
  const lastUndo = createShipmentSourceImportUndo(first, second)
  assert.equal(canUndoShipmentSourceImport(lastUndo, second), true)
  assert.deepEqual(lastUndo.values.items, first.items)
  assert.equal(lastUndo.values.sales_order_id, 12)
  assert.equal(lastUndo.values.total_net_weight_g, undefined)
  assert.equal(canUndoShipmentSourceImport(lastUndo, first), false)
})
