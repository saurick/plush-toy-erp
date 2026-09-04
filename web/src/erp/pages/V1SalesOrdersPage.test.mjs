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
  new URL('../components/sales-orders/salesOrderColumns.jsx', import.meta.url),
  'utf8'
)
const form = readFileSync(
  new URL('../components/sales-orders/SalesOrderForm.jsx', import.meta.url),
  'utf8'
)
const businessModal = readFileSync(
  new URL(
    '../components/sales-orders/SalesOrderBusinessModal.jsx',
    import.meta.url
  ),
  'utf8'
)

test('sales order commercial and delivery fields stay grouped without changing the established modal order', () => {
  for (const copy of [
    '税费与运费条件',
    '计税方式',
    '税率',
    '报价是否含运费',
    '报价运费',
    '交付与收货',
    '国家 / 地区',
    '收货人',
    '收货电话',
    '收货地址',
    '订单数量',
    '单价',
    '金额',
    '货款金额',
    '税额',
    '订单总额',
  ]) {
    assert.match(form, new RegExp(copy.replace('/', '\\/'), 'u'))
  }
  assert.match(form, /unitText="%"/u)
  assert.match(form, /name="quoted_freight_amount"/u)
  assert.match(form, /value !== 'EXCLUDED'/u)
  assert.match(form, /setFieldValue\('quoted_freight_amount', undefined\)/u)
  assert.match(form, /unitText=\{currency \|\| '币种'\}/u)
  assert.match(columns, /title: '报价运费'/u)
  assert.match(columns, /dataIndex: 'quoted_freight_amount'/u)
  assert.doesNotMatch(form, /addonAfter=/u)
  const headerIndex = businessModal.indexOf('<SalesOrderFormFields')
  const attachmentsIndex = businessModal.indexOf('<BusinessAttachmentPanel')
  const itemsIndex = businessModal.indexOf('<SalesOrderItemsFormSection')
  assert(headerIndex >= 0)
  assert(attachmentsIndex > headerIndex)
  assert(itemsIndex > attachmentsIndex)
})

test('planned delivery date header keeps enough width for one line', () => {
  assert.match(
    columns,
    /title: '计划交付日期',[\s\S]*?dataIndex: 'planned_delivery_date',[\s\S]*?effectiveFieldKey: 'expected_ship_date',[\s\S]*?width: 150,/u
  )
})

test('active sales orders expose a permission-bound reservation action', () => {
  assert.match(page, /'stock\.reservation\.create'/u)
  assert.match(page, /selectedOrder\?\.lifecycle_status/u)
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

test('sales lifecycle mutation locks selection and duplicate intent synchronously', () => {
  assert.match(page, /const lifecycleInFlightRef = useRef\(false\)/u)
  assert.match(
    page,
    /if \(lifecycleInFlightRef\.current \|\| !action \|\| !order\)/u
  )
  assert.match(page, /lifecycleInFlightRef\.current = true/u)
  assert.match(page, /lifecycleInFlightRef\.current = false/u)
  assert.match(page, /disabled=\{saving\}[\s\S]*当前订单操作完成后可更换选择/u)
  assert.match(page, /getCheckboxProps: \(\) => \(\{ disabled: saving \}\)/u)
  assert.match(
    page,
    /onChange: \(_keys, selectedRows\) => \{[\s\S]*if \(saving\) return/u
  )
  assert.match(
    page,
    /onOpenRecord=\{saving \? undefined : openSalesOrderRecord\}/u
  )
})

test('sales selection actions keep one authorized catalog across record states', () => {
  for (const actionKey of [
    'related-records',
    'view-details',
    'edit',
    'reserve-stock',
  ]) {
    assert.match(
      page,
      new RegExp(`data-business-action-key="${actionKey}"`, 'u')
    )
  }
  assert.match(page, /actionStates: lifecycleActionStates/u)
  assert.match(page, /actionStates=\{lifecycleActionStates\}/u)
  assert.match(page, /disabled=\{primaryLifecycleState\.disabled\}/u)
  assert.doesNotMatch(page, /canUpdateOrder\s*&&[\s\S]{0,100}!selectedOrder/u)
  assert.doesNotMatch(
    page,
    /canCreateReservation\s*&&[\s\S]{0,120}selectedOrderLifecycleStatus/u
  )
})
