import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPurchaseReceiptAdjustmentPayload,
  buildPurchaseReturnFromReceiptPayload,
} from './purchaseReceiptExceptionAction.mjs'

const receipt = {
  id: 5,
  items: [
    {
      id: 11,
      material_id: 21,
      warehouse_id: 31,
      unit_id: 41,
      lot_id: 51,
      quantity: '10',
    },
  ],
}

test('purchase return payload only sends receipt line and quantity intent', () => {
  const payload = buildPurchaseReturnFromReceiptPayload(
    {
      items: [
        {
          purchase_receipt_item_id: 11,
          quantity: '2.500',
          material_id: 999,
          warehouse_id: 999,
          note: '  拒收退回  ',
        },
      ],
    },
    receipt
  )
  assert.deepEqual(payload, {
    purchase_receipt_id: 5,
    items: [
      {
        purchase_receipt_item_id: 11,
        quantity: '2.5',
        note: '拒收退回',
      },
    ],
  })
})

test('purchase adjustment derives source fields and validates correction target', () => {
  const payload = buildPurchaseReceiptAdjustmentPayload(
    {
      reason: '  批次录入更正  ',
      items: [
        {
          purchase_receipt_item_id: 11,
          adjust_type: 'LOT_CORRECTION',
          quantity: '1',
          warehouse_id: 32,
          lot_id: 52,
          material_id: 999,
        },
      ],
    },
    receipt
  )
  assert.deepEqual(payload, {
    purchase_receipt_id: 5,
    reason: '批次录入更正',
    items: [
      {
        purchase_receipt_item_id: 11,
        adjust_type: 'LOT_CORRECTION_OUT',
        quantity: '1',
        correction_group: 'LOT_CORRECTION-1',
      },
      {
        purchase_receipt_item_id: 11,
        adjust_type: 'LOT_CORRECTION_IN',
        quantity: '1',
        lot_id: 52,
        correction_group: 'LOT_CORRECTION-1',
      },
    ],
  })
})

test('purchase exception payloads reject unknown receipt lines', () => {
  assert.throws(() =>
    buildPurchaseReturnFromReceiptPayload(
      { items: [{ purchase_receipt_item_id: 99, quantity: '1' }] },
      receipt
    )
  )
  assert.throws(() =>
    buildPurchaseReceiptAdjustmentPayload(
      {
        reason: '调整',
        items: [
          {
            purchase_receipt_item_id: 99,
            adjust_type: 'QUANTITY_DECREASE',
            quantity: '1',
          },
        ],
      },
      receipt
    )
  )
})

test('purchase exception quantities preserve numeric(20,6) boundaries exactly', () => {
  assert.equal(
    buildPurchaseReturnFromReceiptPayload(
      {
        items: [
          { purchase_receipt_item_id: 11, quantity: '0.000001' },
        ],
      },
      receipt
    ).items[0].quantity,
    '0.000001'
  )
  assert.deepEqual(
    buildPurchaseReceiptAdjustmentPayload(
      {
        reason: '边界数量调整',
        items: [
          {
            purchase_receipt_item_id: 11,
            adjust_type: 'QUANTITY_INCREASE',
            quantity: '99999999999999.999999',
          },
        ],
      },
      receipt
    ).items[0].quantity,
    '99999999999999.999999'
  )
})
