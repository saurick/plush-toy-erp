import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildReservationBalanceChoices,
  buildSalesOrderReservationItemChoices,
  buildSalesOrderReservationPayload,
  defaultSalesOrderReservationQuantity,
} from './salesOrderReservationAction.mjs'

const item = {
  id: 11,
  sales_order_id: 5,
  product_id: 7,
  product_sku_id: 8,
  unit_id: 9,
  ordered_quantity: '10',
  line_status: 'open',
  product_code_snapshot: 'P-001',
}
const balance = {
  id: 21,
  subject_id: 7,
  product_sku_id: 8,
  warehouse_id: 3,
  unit_id: 9,
  lot_id: 4,
  available_quantity: '6',
  warehouse_name: '成品仓',
  lot_no: 'LOT-01',
}

test('reservation choices keep order and active reservation facts separate', () => {
  const choices = buildSalesOrderReservationItemChoices(
    [item],
    [
      { sales_order_item_id: 11, status: 'ACTIVE', quantity: '2' },
      { sales_order_item_id: 11, status: 'RELEASED', quantity: '9' },
    ]
  )
  assert.equal(choices[0].ordered, '10')
  assert.equal(choices[0].activeReserved, '2')
  assert.equal(choices[0].shipped, '')
  assert.equal(choices[0].reservable, '8')
  assert.equal(choices[0].disabled, false)
})

test('reservation choices subtract shipped and active reserved quantities', () => {
  const choices = buildSalesOrderReservationItemChoices(
    [item],
    [{ sales_order_item_id: 11, status: 'ACTIVE', quantity: '2' }],
    [
      {
        status: 'SHIPPED',
        items: [{ sales_order_item_id: 11, quantity: '3' }],
      },
      {
        status: 'DRAFT',
        items: [{ sales_order_item_id: 11, quantity: '9' }],
      },
    ]
  )
  assert.equal(choices[0].activeReserved, '2')
  assert.equal(choices[0].shipped, '3')
  assert.equal(choices[0].reservable, '5')
  assert.equal(choices[0].disabled, false)
})

test('fully committed sales lines are disabled and defaults are capped', () => {
  const [choice] = buildSalesOrderReservationItemChoices(
    [item],
    [{ sales_order_item_id: 11, status: 'ACTIVE', quantity: '6' }],
    [
      {
        status: 'SHIPPED',
        items: [{ sales_order_item_id: 11, quantity: '4' }],
      },
    ]
  )
  assert.equal(choice.reservable, '')
  assert.equal(choice.disabled, true)

  assert.equal(
    defaultSalesOrderReservationQuantity(
      { reservable: '5' },
      { available: '6' }
    ),
    '5'
  )
  assert.equal(
    defaultSalesOrderReservationQuantity(
      { reservable: '5' },
      { available: '4' }
    ),
    '4'
  )
})

test('reservation balance choices only expose matching available stock grain', () => {
  const choices = buildReservationBalanceChoices(
    [balance, { ...balance, id: 22, product_sku_id: 99 }],
    { productID: 7, productSkuID: 8 }
  )
  assert.equal(choices.length, 1)
  assert.match(choices[0].label, /成品仓 \/ LOT-01 · 可用 6/u)
})

test('reservation payload derives protected source and stock fields', () => {
  const payload = buildSalesOrderReservationPayload(
    {
      sales_order_item_id: 11,
      balance_id: 21,
      quantity: '2.500',
      note: '  订单备货  ',
      product_id: 999,
      product_sku_id: 999,
      warehouse_id: 999,
      unit_id: 999,
    },
    { id: 5, lifecycle_status: 'active' },
    [item],
    [balance]
  )
  assert.deepEqual(payload, {
    sales_order_id: 5,
    sales_order_item_id: 11,
    warehouse_id: 3,
    lot_id: 4,
    quantity: '2.5',
    note: '订单备货',
  })
  assert.deepEqual(Object.keys(payload).sort(), [
    'lot_id',
    'note',
    'quantity',
    'sales_order_id',
    'sales_order_item_id',
    'warehouse_id',
  ])
  for (const serverDerivedField of [
    'product_id',
    'product_sku_id',
    'unit_id',
  ]) {
    assert.equal(serverDerivedField in payload, false)
  }
})

test('reservation payload rejects a mismatched inventory grain', () => {
  assert.throws(() =>
    buildSalesOrderReservationPayload(
      { sales_order_item_id: 11, balance_id: 21, quantity: '1' },
      { id: 5, lifecycle_status: 'active' },
      [item],
      [{ ...balance, product_sku_id: 99 }]
    )
  )
})

test('reservation payload rejects quantities above the remaining order commitment', () => {
  assert.throws(
    () =>
      buildSalesOrderReservationPayload(
        { sales_order_item_id: 11, balance_id: 21, quantity: '6' },
        { id: 5, lifecycle_status: 'active' },
        [item],
        [balance],
        [{ sales_order_item_id: 11, status: 'ACTIVE', quantity: '2' }],
        [
          {
            status: 'SHIPPED',
            items: [{ sales_order_item_id: 11, quantity: '3' }],
          },
        ]
      ),
    /订单剩余可预留数量/u
  )
})

test('reservation payload rejects an inactive order or closed order line', () => {
  const values = { sales_order_item_id: 11, balance_id: 21, quantity: '1' }
  assert.throws(
    () =>
      buildSalesOrderReservationPayload(
        values,
        { id: 5, lifecycle_status: 'draft' },
        [item],
        [balance]
      ),
    /仅生效中的销售订单/u
  )
  assert.throws(() =>
    buildSalesOrderReservationPayload(
      values,
      { id: 5, lifecycle_status: 'active' },
      [{ ...item, line_status: 'closed' }],
      [balance]
    )
  )
})
