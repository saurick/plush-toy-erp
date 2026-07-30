import assert from 'node:assert/strict'
import test from 'node:test'

import { readFileSync } from 'node:fs'

import {
  buildPurchaseInboundDraftPreviewRows as buildInboundDraftPreviewRows,
  validatePurchaseOrderReceiptProgress,
} from '../../utils/purchaseOrderInboundPreview.mjs'

const pageConfigSource = readFileSync(
  new URL('./purchaseOrderPageConfig.mjs', import.meta.url),
  'utf8'
)
const previewSource = readFileSync(
  new URL('../../utils/purchaseOrderInboundPreview.mjs', import.meta.url),
  'utf8'
)

function progressItem(overrides = {}) {
  return {
    purchase_order_item_id: 11,
    line_no: 1,
    material_id: 21,
    material_code: 'MAT-PREVIEW',
    material_name: '短毛绒',
    unit_id: 31,
    unit_code: 'KG',
    unit_name: '千克',
    line_status: 'open',
    purchased_quantity: '10.000006',
    effective_received_quantity: '5.000001',
    draft_reserved_quantity: '2.000002',
    remaining_receivable_quantity: '5.000005',
    remaining_generatable_quantity: '3.000003',
    can_generate: true,
    disabled_reason: '',
    ...overrides,
  }
}

function receiptProgress(overrides = {}) {
  return {
    purchase_order_id: 7,
    purchase_order_no: 'PO-PREVIEW',
    lifecycle_status: 'approved',
    items: [progressItem()],
    ...overrides,
  }
}

test('purchase order page config delegates preview mapping to the server projection helper', () => {
  assert.match(pageConfigSource, /buildPurchaseInboundDraftPreviewRows/u)
  assert.doesNotMatch(pageConfigSource, /decimalNumber|Math\.max/u)
  assert.doesNotMatch(
    previewSource,
    /addNumeric20Scale6Units|subtractNumeric20Scale6Units|receipts\s*=|orderItems\s*=/u
  )
})

test('purchase inbound preview preserves authoritative numeric(20,6) values exactly', () => {
  const [row] = buildInboundDraftPreviewRows(receiptProgress())
  assert.deepEqual(row, {
    key: 11,
    lineNo: 1,
    material: '短毛绒（MAT-PREVIEW）',
    unit: '千克',
    purchasedQuantity: '10.000006',
    effectiveReceivedQuantity: '5.000001',
    draftReservedQuantity: '2.000002',
    remainingReceivableQuantity: '5.000005',
    remainingGeneratableQuantity: '3.000003',
    canGenerate: true,
    disabledReason: '',
  })

  const maximum = '99999999999999.999999'
  const [maximumRow] = buildInboundDraftPreviewRows(
    receiptProgress({
      items: [
        progressItem({
          purchased_quantity: maximum,
          effective_received_quantity: '0.000001',
          draft_reserved_quantity: '0',
          remaining_receivable_quantity: '99999999999999.999998',
          remaining_generatable_quantity: '99999999999999.999998',
        }),
      ],
    })
  )
  assert.equal(maximumRow.purchasedQuantity, maximum)
  assert.equal(maximumRow.remainingGeneratableQuantity, '99999999999999.999998')
})

test('purchase inbound preview keeps readable draft over-reservation fail-closed', () => {
  const [row] = buildInboundDraftPreviewRows(
    receiptProgress({
      items: [
        progressItem({
          effective_received_quantity: '8',
          draft_reserved_quantity: '5',
          remaining_receivable_quantity: '2',
          remaining_generatable_quantity: '0',
          can_generate: false,
          disabled_reason: '现有入库草稿占用超过剩余可收数量，请先处理草稿',
        }),
      ],
    })
  )
  assert.equal(row.canGenerate, false)
  assert.equal(row.remainingGeneratableQuantity, '0')
  assert.equal(
    row.disabledReason,
    '现有入库草稿占用超过剩余可收数量，请先处理草稿'
  )
})

test('purchase receipt progress validator rejects malformed or incoherent projections', () => {
  for (const invalid of [
    null,
    receiptProgress({ purchase_order_id: 0 }),
    receiptProgress({ purchase_order_no: '' }),
    receiptProgress({
      items: [progressItem({ purchased_quantity: '1.000000' })],
    }),
    receiptProgress({
      items: [progressItem({ purchased_quantity: '-1' })],
    }),
    receiptProgress({
      items: [progressItem({ remaining_generatable_quantity: '0' })],
    }),
    receiptProgress({
      items: [
        progressItem({
          can_generate: false,
          disabled_reason: '',
          remaining_generatable_quantity: '0',
        }),
      ],
    }),
    receiptProgress({
      items: [progressItem(), progressItem({ line_no: 2 })],
    }),
  ]) {
    assert.throws(
      () => validatePurchaseOrderReceiptProgress(invalid),
      (error) => error?.isInvalidResponse === true
    )
  }
  assert.throws(
    () => validatePurchaseOrderReceiptProgress(receiptProgress(), 8),
    (error) => error?.isInvalidResponse === true
  )
})

test('purchase receipt progress validator accepts an empty authoritative order projection', () => {
  const progress = receiptProgress({ items: [] })
  assert.deepEqual(validatePurchaseOrderReceiptProgress(progress, 7), progress)
})
