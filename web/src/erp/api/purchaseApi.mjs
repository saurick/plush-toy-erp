import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  requirePurchaseReceiptIdempotencyKey,
  validatePurchaseReceiptDraft,
  validatePurchaseReceiptItem,
} from '../utils/purchaseReceiptMutation.mjs'

const purchaseRpc = new JsonRpc({
  url: 'purchase',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listPurchaseReceipts(params = {}, options = {}) {
  const result = await purchaseRpc.call(
    'list_purchase_receipts',
    params,
    options
  )
  return dataOf(result)
}

export async function createPurchaseReceiptDraft(params = {}) {
  const result = await purchaseRpc.call('create_purchase_receipt_draft', params)
  return dataOf(result)?.purchase_receipt || null
}

export async function createPurchaseReceiptWithItems(params = {}) {
  const result = await purchaseRpc.call(
    'create_purchase_receipt_with_items',
    params
  )
  return dataOf(result)?.purchase_receipt || null
}

export async function createPurchaseReceiptFromPurchaseOrder(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call(
    'create_purchase_receipt_from_purchase_order',
    params
  )
  return validatePurchaseReceiptDraft(dataOf(result)?.purchase_receipt, {
    receiptNo: params.receipt_no,
  })
}

export async function addPurchaseReceiptItem(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call('add_purchase_receipt_item', params)
  return validatePurchaseReceiptItem(dataOf(result)?.purchase_receipt_item, {
    receiptID: Number(params.receipt_id || 0),
    materialID: Number(params.material_id || 0),
    warehouseID: Number(params.warehouse_id || 0),
    unitID: Number(params.unit_id || 0),
  })
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
