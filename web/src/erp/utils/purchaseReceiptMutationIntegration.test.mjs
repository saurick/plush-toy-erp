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
  new URL('../pages/V1PurchaseReceiptsPage.jsx', import.meta.url),
  'utf8'
)

function functionSlice(source, start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert(startIndex >= 0 && endIndex > startIndex)
  return source.slice(startIndex, endIndex)
}

test('purchase order inbound draft keeps unknown results in the current modal', () => {
  const mutation = functionSlice(
    inboundDraftHook,
    'const createInboundDraftFromOrder',
    'const hasInboundDraftRemaining'
  )
  assert.match(inboundDraftHook, /createPurchaseReceiptMutationAttemptStore/u)
  assert.match(
    mutation,
    /mutationAttemptsRef\.current\.prepare\(scope, payload\)/u
  )
  assert.match(
    mutation,
    /createPurchaseReceiptFromPurchaseOrder\(\s*attempt\.params\s*\)/u
  )
  assert.match(mutation, /settle\(scope, attempt, error\)/u)
  assert.match(
    mutation,
    /入库草稿生成结果尚未确认，系统将使用原请求核对，请不要重复生成。/u
  )
  const catchBody = mutation.match(
    /catch \(error\) \{([\s\S]*?)\n {4}\} finally/u
  )?.[1]
  assert(catchBody)
  assert.doesNotMatch(catchBody, /closeInboundDraftModal|navigate/u)
  assert(
    mutation.indexOf('settle(scope, attempt)') <
      mutation.indexOf('closeInboundDraftModal()')
  )
  assert(
    mutation.indexOf('closeInboundDraftModal()') < mutation.indexOf('navigate(')
  )
  assert.doesNotMatch(inboundDraftHook, /idempotency_key/u)
})

test('purchase receipt add-item keeps unknown results in the current editor', () => {
  const mutation = functionSlice(
    purchaseReceiptPage,
    'const handleAddItem',
    'const runReceiptAction'
  )
  assert.match(
    purchaseReceiptPage,
    /createPurchaseReceiptMutationAttemptStore/u
  )
  assert.match(mutation, /mutationAttemptsRef\.current\.prepare/u)
  assert.match(mutation, /addPurchaseReceiptItem\(attempt\.params\)/u)
  assert.match(mutation, /settle\(scope, attempt, error\)/u)
  assert.match(
    mutation,
    /入库明细添加结果尚未确认，系统将使用原请求核对，请不要重复添加。/u
  )
  const catchBody = mutation.match(
    /catch \(error\) \{([\s\S]*?)\n {6}\} finally/u
  )?.[1]
  assert(catchBody)
  assert.doesNotMatch(catchBody, /closeItemEditor|loadRows/u)
  assert(
    mutation.indexOf('settle(scope, attempt)') <
      mutation.indexOf('closeItemEditor()')
  )
  assert(
    mutation.indexOf('closeItemEditor()') < mutation.indexOf('await loadRows()')
  )
  assert.doesNotMatch(purchaseReceiptPage, /idempotency_key/u)
})
