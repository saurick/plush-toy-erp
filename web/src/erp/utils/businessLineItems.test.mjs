import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPurchaseReceiptItemParams,
  buildShipmentItemParams,
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
