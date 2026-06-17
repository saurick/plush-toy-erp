import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

const purchaseRpc = new JsonRpc({
  url: 'purchase',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listPurchaseReceipts(params = {}) {
  const result = await purchaseRpc.call('list_purchase_receipts', params)
  return dataOf(result)
}

export async function createPurchaseReceiptDraft(params = {}) {
  const result = await purchaseRpc.call('create_purchase_receipt_draft', params)
  return dataOf(result)?.purchase_receipt || null
}

export async function createPurchaseReceiptFromPurchaseOrder(params = {}) {
  const result = await purchaseRpc.call(
    'create_purchase_receipt_from_purchase_order',
    params
  )
  return dataOf(result)?.purchase_receipt || null
}

export async function addPurchaseReceiptItem(params = {}) {
  const result = await purchaseRpc.call('add_purchase_receipt_item', params)
  return dataOf(result)?.purchase_receipt_item || null
}

export async function getPurchaseReceipt(params = {}) {
  const result = await purchaseRpc.call('get_purchase_receipt', params)
  return dataOf(result)?.purchase_receipt || null
}

export async function postPurchaseReceipt(params = {}) {
  const result = await purchaseRpc.call('post_purchase_receipt', params)
  return dataOf(result)?.purchase_receipt || null
}

export async function cancelPurchaseReceipt(params = {}) {
  const result = await purchaseRpc.call('cancel_purchase_receipt', params)
  return dataOf(result)?.purchase_receipt || null
}
