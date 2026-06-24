import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildShipmentSourceRows,
  buildPurchaseReceiptItemParams,
  buildShipmentItemParams,
  createBlankPurchaseReceiptItem,
  createDuplicatedDraftLineItem,
  createShipmentItemFromSalesOrderItem,
  isBlankShipmentItem,
} from './businessLineItems.mjs'

test('businessLineItems: purchase receipt item keeps source line as display only', () => {
  assert.deepEqual(
    buildPurchaseReceiptItemParams('9', {
      material_id: '12',
      warehouse_id: '3',
      unit_id: '2',
      purchase_order_item_id: '15',
      source_line_no: ' old line ',
      quantity: ' 5.5 ',
      unit_price: '',
      amount: '12.30',
    }),
    {
      receipt_id: 9,
      material_id: 12,
      warehouse_id: 3,
      unit_id: 2,
      purchase_order_item_id: 15,
      source_line_no: 'old line',
      quantity: '5.5',
      amount: '12.30',
    }
  )
})

test('businessLineItems: blank purchase receipt item starts as unsaved draft detail', () => {
  assert.deepEqual(createBlankPurchaseReceiptItem(), {
    receipt_id: undefined,
    material_id: undefined,
    warehouse_id: undefined,
    unit_id: undefined,
    lot_id: undefined,
    purchase_order_item_id: undefined,
    lot_no: '',
    quantity: '',
    unit_price: '',
    amount: '',
    source_line_no: '',
    note: '',
  })
})

test('businessLineItems: duplicated draft line item clears identity and status fields', () => {
  const source = {
    id: 31,
    line_no: 4,
    line_status: 'closed',
    created_at: 100,
    updated_at: 200,
    material_id: 12,
    unit_id: 2,
    purchased_quantity: '10',
    unit_price: '3.5',
    note: ' 同批 ',
  }

  assert.deepEqual(createDuplicatedDraftLineItem(source), {
    material_id: 12,
    unit_id: 2,
    purchased_quantity: '10',
    unit_price: '3.5',
    note: ' 同批 ',
  })
  assert.equal(source.id, 31)
  assert.equal(source.line_no, 4)
})

test('businessLineItems: shipment item preserves SKU traceability from sales order line', () => {
  const item = createShipmentItemFromSalesOrderItem(
    {
      id: 31,
      product_id: 7,
      product_sku_id: 11,
      unit_id: 2,
      ordered_quantity: '20',
      product_name_snapshot: '小熊',
    },
    5
  )

  assert.equal(item.product_sku_id, 11)
  assert.equal(isBlankShipmentItem(item), false)
  assert.deepEqual(buildShipmentItemParams(item), {
    shipment_id: 5,
    sales_order_item_id: 31,
    product_id: 7,
    product_sku_id: 11,
    warehouse_id: 0,
    unit_id: 2,
    quantity: '20',
    note: '来源销售订单行：小熊',
  })
})

test('businessLineItems: shipment source rows show shipped and remaining quantities', () => {
  const rows = buildShipmentSourceRows({
    salesOrderItems: [
      {
        id: 31,
        line_no: 1,
        product_id: 7,
        unit_id: 2,
        ordered_quantity: '20',
        line_status: 'open',
      },
      {
        id: 32,
        line_no: 2,
        product_id: 8,
        unit_id: 2,
        ordered_quantity: '5',
        line_status: 'closed',
      },
    ],
    shipments: [
      {
        status: 'SHIPPED',
        items: [{ sales_order_item_id: 31, quantity: '8.5' }],
      },
      {
        status: 'CANCELLED',
        items: [{ sales_order_item_id: 31, quantity: '3' }],
      },
    ],
  })

  assert.equal(rows[0].shippedQuantity, 8.5)
  assert.equal(rows[0].remainingQuantity, 11.5)
  assert.equal(rows[0].disabledReason, '')
  assert.equal(rows[1].disabledReason, '来源行已关闭')
})

test('businessLineItems: shipment import defaults to remaining source quantity', () => {
  const item = createShipmentItemFromSalesOrderItem(
    {
      id: 31,
      product_id: 7,
      product_sku_id: 11,
      unit_id: 2,
      ordered_quantity: '20',
      remainingQuantity: 11.5,
      product_name_snapshot: '小熊',
    },
    5
  )

  assert.equal(item.quantity, 11.5)
})
