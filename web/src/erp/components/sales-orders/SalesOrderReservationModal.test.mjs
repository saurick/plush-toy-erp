import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./SalesOrderReservationModal.jsx', import.meta.url),
  'utf8'
)

test('sales order reservation modal keeps the source summary business-readable', () => {
  for (const label of ['销售订单', '产品', 'SKU / 规格', '单位']) {
    assert.match(source, new RegExp(`label: '${label}'`, 'u'))
  }
  assert.match(source, /product_code_snapshot/u)
  assert.match(source, /product_name_snapshot/u)
  assert.match(source, /sku_code_snapshot/u)
  assert.match(source, /unit_name_snapshot/u)
})

test('sales order reservation modal only edits operator-owned and local selection fields', () => {
  for (const formField of [
    'sales_order_item_id',
    'balance_id',
    'quantity',
    'reserved_at',
    'note',
  ]) {
    assert.match(source, new RegExp(`name="${formField}"`, 'u'))
  }
  for (const serverDerivedField of [
    'product_id',
    'product_sku_id',
    'warehouse_id',
    'lot_id',
    'unit_id',
    'idempotency_key',
  ]) {
    assert.doesNotMatch(source, new RegExp(`name="${serverDerivedField}"`, 'u'))
  }
  assert.match(source, /disabled=\{loading\}/u)
  assert.match(source, /destroyOnHidden/u)
  assert.match(source, /afterOpenChange=\{initializeOpenForm\}/u)
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(
    source,
    /buildSalesOrderReservationItemChoices\(items, reservations, shipments\)/u
  )
  assert.match(source, /defaultSalesOrderReservationQuantity/u)
  assert.match(source, /订单剩余可预留数量/u)
})
