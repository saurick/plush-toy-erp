import assert from 'node:assert/strict'
import test from 'node:test'

import { readFileSync } from 'node:fs'

import { buildPurchaseInboundDraftPreviewRows as buildInboundDraftPreviewRows } from '../../utils/purchaseOrderInboundPreview.mjs'

const pageConfigSource = readFileSync(
  new URL('./purchaseOrderPageConfig.mjs', import.meta.url),
  'utf8'
)

test('purchase order page config delegates preview arithmetic to the exact helper', () => {
  assert.match(pageConfigSource, /buildPurchaseInboundDraftPreviewRows/u)
  assert.doesNotMatch(pageConfigSource, /decimalNumber|Math\.max/u)
})

function orderItem(overrides = {}) {
  return {
    id: 11,
    line_no: 1,
    line_status: 'open',
    material_id: 21,
    unit_id: 31,
    purchased_quantity: '10',
    ...overrides,
  }
}

function receipt(quantity, overrides = {}) {
  return {
    status: 'POSTED',
    items: [{ purchase_order_item_id: 11, quantity }],
    ...overrides,
  }
}

test('purchase inbound preview preserves numeric(20,6) boundaries exactly', () => {
  const [tiny] = buildInboundDraftPreviewRows({
    orderItems: [orderItem({ purchased_quantity: '0.000001' })],
  })
  assert.deepEqual(
    {
      purchased: tiny.purchasedQuantity,
      received: tiny.receivedQuantity,
      remaining: tiny.remainingQuantity,
      disabledReason: tiny.disabledReason,
    },
    {
      purchased: '0.000001',
      received: '0',
      remaining: '0.000001',
      disabledReason: '',
    }
  )

  const maximum = '99999999999999.999999'
  const [maximumRow] = buildInboundDraftPreviewRows({
    orderItems: [orderItem({ purchased_quantity: maximum })],
    receipts: [receipt('0.000001')],
  })
  assert.equal(maximumRow.purchasedQuantity, maximum)
  assert.equal(maximumRow.receivedQuantity, '0.000001')
  assert.equal(maximumRow.remainingQuantity, '99999999999999.999998')
  assert.equal(maximumRow.disabledReason, '')
})

test('purchase inbound preview accumulates exact facts and ignores cancelled receipts', () => {
  const [row] = buildInboundDraftPreviewRows({
    orderItems: [orderItem({ purchased_quantity: '0.000002' })],
    receipts: [
      receipt('0.000001'),
      receipt('0.000001'),
      receipt('99999999999999.999999', { status: 'CANCELLED' }),
    ],
  })
  assert.equal(row.receivedQuantity, '0.000002')
  assert.equal(row.remainingQuantity, '0')
  assert.equal(row.disabledReason, '已全部生成入库')
})
