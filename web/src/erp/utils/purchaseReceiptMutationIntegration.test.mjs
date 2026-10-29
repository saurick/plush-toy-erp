import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const inboundDraftHook = readFileSync(
  new URL(
    '../components/purchase-orders/usePurchaseOrderInboundDraft.mjs',
    import.meta.url
  ),
  'utf8'
)
const purchaseReceiptPage = readFileSync(
  new URL('../pages/PurchaseReceiptsPage.jsx', import.meta.url),
  'utf8'
)

function functionSlice(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert(startIndex >= 0 && endIndex > startIndex)
  return source.slice(startIndex, endIndex)
}

test('purchase order inbound draft reads the authoritative receipt progress once', () => {
  const load = functionSlice(
    inboundDraftHook,
    'const openInboundDraftModal',
    'const createInboundDraftFromOrder'
  )
  assert.match(load, /getPurchaseOrderReceiptProgress\(\{\s*id: record\.id/u)
  assert.match(load, /buildInboundDraftPreviewRows\(progress\)/u)
  assert.match(load, /到货材料加载失败，请重试/u)
  assert.doesNotMatch(
    inboundDraftHook,
    /listAllPurchaseReceipts|loadOrderItems\(record\)|remainingQuantity > 0/u
  )
  assert.match(
    inboundDraftHook,
    /inboundDraftPreviewRows\.some\(\(row\) => row\.canGenerate\)/u
  )
})

test('purchase receipt page does not append source-less manual lines', () => {
  for (const retiredEntry of [
    'addPurchaseReceiptItem',
    'PurchaseReceiptInlineItemEditor',
    'buildPurchaseReceiptItemParams',
    '添加入库明细',
  ]) {
    assert.equal(
      purchaseReceiptPage.includes(retiredEntry),
      false,
      `source-generated receipt page must not expose ${retiredEntry}`
    )
  }
})
