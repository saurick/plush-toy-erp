import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
import {
  requirePurchaseReceiptIdempotencyKey,
  validatePurchaseReceiptDraft,
  validatePurchaseReceiptItem,
} from '../utils/purchaseReceiptMutation.mjs'
import { listAllPaginatedRecords } from '../utils/referencePagination.mjs'

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

export async function listAllPurchaseReceipts(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listPurchaseReceipts,
    params,
    'purchase_receipts',
    options,
    {
      invalidResponseMessage: '服务器返回的采购入库记录不完整，请刷新后重试',
    }
  )
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

export async function getPurchaseReceipt(params = {}, options = {}) {
  const result = await purchaseRpc.call('get_purchase_receipt', params, options)
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

export async function createPurchaseReturnFromReceipt(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call(
    'create_purchase_return_from_receipt',
    params
  )
  return dataOf(result)?.purchase_return || null
}

export async function createPurchaseReturnFromQualityInspection(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call(
    'create_purchase_return_from_quality_inspection',
    params
  )
  return dataOf(result)?.purchase_return || null
}

export async function getPurchaseReturn(params = {}) {
  const result = await purchaseRpc.call('get_purchase_return', params)
  return dataOf(result)?.purchase_return || null
}

export async function listPurchaseReturns(params = {}, options = {}) {
  const result = await purchaseRpc.call(
    'list_purchase_returns',
    params,
    options
  )
  return dataOf(result)
}

export async function listAllPurchaseReturns(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listPurchaseReturns,
    params,
    'purchase_returns',
    options,
    {
      invalidResponseMessage: '服务器返回的采购退货记录不完整，请刷新后重试',
    }
  )
}

export async function postPurchaseReturn(params = {}) {
  const result = await purchaseRpc.call('post_purchase_return', params)
  return dataOf(result)?.purchase_return || null
}

export async function cancelPurchaseReturn(params = {}) {
  const result = await purchaseRpc.call('cancel_purchase_return', params)
  return dataOf(result)?.purchase_return || null
}

export async function createPurchaseReceiptAdjustmentFromReceipt(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call(
    'create_purchase_receipt_adjustment_from_receipt',
    params
  )
  return dataOf(result)?.purchase_receipt_adjustment || null
}

export async function getPurchaseReceiptAdjustment(params = {}) {
  const result = await purchaseRpc.call(
    'get_purchase_receipt_adjustment',
    params
  )
  return dataOf(result)?.purchase_receipt_adjustment || null
}

export async function listPurchaseReceiptAdjustments(
  params = {},
  options = {}
) {
  const result = await purchaseRpc.call(
    'list_purchase_receipt_adjustments',
    params,
    options
  )
  return dataOf(result)
}

export async function listAllPurchaseReceiptAdjustments(
  params = {},
  options = {}
) {
  return listAllPaginatedRecords(
    listPurchaseReceiptAdjustments,
    params,
    'purchase_receipt_adjustments',
    options,
    {
      invalidResponseMessage:
        '服务器返回的采购入库调整记录不完整，请刷新后重试',
    }
  )
}

export async function postPurchaseReceiptAdjustment(params = {}) {
  const result = await purchaseRpc.call(
    'post_purchase_receipt_adjustment',
    params
  )
  return dataOf(result)?.purchase_receipt_adjustment || null
}

export async function cancelPurchaseReceiptAdjustment(params = {}) {
  const result = await purchaseRpc.call(
    'cancel_purchase_receipt_adjustment',
    params
  )
  return dataOf(result)?.purchase_receipt_adjustment || null
}

export async function createPurchaseRejectionDisposition(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call(
    'create_purchase_rejection_disposition',
    params
  )
  return dataOf(result)?.purchase_rejection_disposition || null
}

export async function postPurchaseRejectionDisposition(params = {}) {
  const result = await purchaseRpc.call(
    'post_purchase_rejection_disposition',
    params
  )
  return dataOf(result)?.purchase_rejection_disposition || null
}

export async function cancelPurchaseRejectionDisposition(params = {}) {
  const result = await purchaseRpc.call(
    'cancel_purchase_rejection_disposition',
    params
  )
  return dataOf(result)?.purchase_rejection_disposition || null
}

export async function getPurchaseRejectionDisposition(
  params = {},
  options = {}
) {
  const result = await purchaseRpc.call(
    'get_purchase_rejection_disposition',
    params,
    options
  )
  return dataOf(result)?.purchase_rejection_disposition || null
}
