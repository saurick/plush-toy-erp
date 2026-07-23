import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(
  new URL('./V1SalesOrdersPage.jsx', import.meta.url),
  'utf8'
)
const modal = readFileSync(
  new URL(
    '../components/sales-orders/SalesOrderReservationModal.jsx',
    import.meta.url
  ),
  'utf8'
)
const columns = readFileSync(
  new URL(
    '../components/sales-orders/salesOrderColumns.jsx',
    import.meta.url
  ),
  'utf8'
)

test('planned delivery date header keeps enough width for one line', () => {
  assert.match(
    columns,
    /title: '计划交付日期',[\s\S]*?dataIndex: 'planned_delivery_date',[\s\S]*?effectiveFieldKey: 'expected_ship_date',[\s\S]*?width: 150,/u
  )
})

test('active sales orders expose a permission-bound reservation action', () => {
  assert.match(page, /'stock\.reservation\.create'/u)
  assert.match(page, /selectedOrder\.lifecycle_status/u)
  assert.match(page, /\.toLowerCase\(\) !== 'active'/u)
  assert.match(page, /getSalesOrder\(\{ id: orderID \}\)/u)
  assert.match(page, /selectedOrderIDRef\.current = orderID/u)
  assert.match(page, /listAllSalesOrderItems/u)
  assert.match(page, /buildSalesOrderReservationItemChoices/u)
})

test('reservation context uses existing facts and matching available stock', () => {
  assert.match(
    page,
    /listAllStockReservations\(\{[\s\S]*source_id: orderID,[\s\S]*status: 'ACTIVE',[\s\S]*\}\)/u
  )
  assert.match(
    page,
    /listAllShipments\(\{ source_id: orderID, status: 'SHIPPED' \}\)/u
  )
  assert.match(page, /firstReservableItem/u)
  assert.match(page, /相关预留或出货记录未完整加载，暂不能新增预留/u)
  assert.match(page, /shipments=\{reservationContext\.shipments\}/u)
  assert.match(page, /subject_type: 'PRODUCT'/u)
  assert.match(page, /subject_id: Number\(item\.product_id/u)
  assert.match(page, /listAllInventoryBalances\(params\)/u)
  assert.match(
    page,
    /listAllInventoryLots\(\{ \.\.\.params, status: 'ACTIVE' \}\)/u
  )
  assert.match(page, /enrichReservationBalances/u)
  assert.match(modal, /当前生效预留/u)
  assert.match(modal, /已出货/u)
  assert.match(modal, /可预留/u)
  assert.match(modal, /defaultSalesOrderReservationQuantity/u)
})

test('reservation submit owns its number and safe retry identity', () => {
  assert.match(page, /buildSalesOrderReservationPayload/u)
  assert.match(page, /createSourceBusinessActionAttemptStore/u)
  assert.match(page, /sourceBusinessActionNo/u)
  assert.match(page, /createStockReservationFromSalesOrder\(params\)/u)
  assert.doesNotMatch(page, /createStockReservation\(params\)/u)
  assert.match(page, /result\.status !== 'ACTIVE'/u)
  assert.match(page, /customer_key: activeCustomerKey \|\| undefined/u)
  assert.match(
    page,
    /暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录/u
  )
  assert.match(page, /V1_ROUTE_PATHS\.outbound/u)
  assert.doesNotMatch(page, /consumeStockReservation|shipShipment/u)
})

test('reservation form keeps source and stock identities out of visible copy', () => {
  for (const forbiddenCopy of [
    'sales_order_id',
    'sales_order_item_id',
    'product_id',
    'product_sku_id',
    'warehouse_id',
    'lot_id',
    'unit_id',
    'idempotency_key',
  ]) {
    assert.equal(modal.includes(`>${forbiddenCopy}<`), false)
  }
  assert.match(modal, /disabled=\{loading\}/u)
  assert.match(modal, /预留只会锁定可用库存/u)
  assert.match(modal, /label: '产品'/u)
  assert.match(modal, /label: 'SKU \/ 规格'/u)
  assert.match(modal, /label: '单位'/u)
})
