import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc, requireRpcData as dataOf } from '@/common/utils/jsonRpc'
import {
  requirePurchaseReceiptIdempotencyKey,
  validatePurchaseReceiptDraft,
  validatePurchaseReceiptItem,
} from '../utils/purchaseReceiptMutation.mjs'
import { listAllPaginatedRecords } from '../utils/referencePagination.mjs'

const purchaseRpc = new JsonRpc({
  url: RpcDomain.PURCHASE,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function listPurchaseReceipts(params = {}, options = {}) {
  const result = await purchaseRpc.call(
    RpcMethod.purchase.LIST_PURCHASE_RECEIPTS,
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
    RpcMethod.purchase.CREATE_PURCHASE_RECEIPT_FROM_PURCHASE_ORDER,
    params
  )
  return validatePurchaseReceiptDraft(dataOf(result)?.purchase_receipt, {
    receiptNo: params.receipt_no,
  })
}

export async function addPurchaseReceiptItem(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call(RpcMethod.purchase.ADD_PURCHASE_RECEIPT_ITEM, params)
  return validatePurchaseReceiptItem(dataOf(result)?.purchase_receipt_item, {
    receiptID: Number(params.receipt_id || 0),
    materialID: Number(params.material_id || 0),
    warehouseID: Number(params.warehouse_id || 0),
    unitID: Number(params.unit_id || 0),
  })
}

export async function getPurchaseReceipt(params = {}, options = {}) {
  const result = await purchaseRpc.call(RpcMethod.purchase.GET_PURCHASE_RECEIPT, params, options)
  return dataOf(result)?.purchase_receipt || null
}

export async function postPurchaseReceipt(params = {}) {
  const result = await purchaseRpc.call(RpcMethod.purchase.POST_PURCHASE_RECEIPT, params)
  return dataOf(result)?.purchase_receipt || null
}

export async function cancelPurchaseReceiptDraft(params = {}) {
  const result = await purchaseRpc.call(RpcMethod.purchase.CANCEL_PURCHASE_RECEIPT_DRAFT, params)
  return dataOf(result)?.purchase_receipt || null
}

export async function cancelPurchaseReceipt(params = {}) {
  const result = await purchaseRpc.call(RpcMethod.purchase.CANCEL_PURCHASE_RECEIPT, params)
  return dataOf(result)?.purchase_receipt || null
}

export async function createPurchaseReturnFromReceipt(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call(
    RpcMethod.purchase.CREATE_PURCHASE_RETURN_FROM_RECEIPT,
    params
  )
  return dataOf(result)?.purchase_return || null
}

export async function createPurchaseReturnFromQualityInspection(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call(
    RpcMethod.purchase.CREATE_PURCHASE_RETURN_FROM_QUALITY_INSPECTION,
    params
  )
  return dataOf(result)?.purchase_return || null
}

export async function getPurchaseReturn(params = {}) {
  const result = await purchaseRpc.call(RpcMethod.purchase.GET_PURCHASE_RETURN, params)
  return dataOf(result)?.purchase_return || null
}

export async function listPurchaseReturns(params = {}, options = {}) {
  const result = await purchaseRpc.call(
    RpcMethod.purchase.LIST_PURCHASE_RETURNS,
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
  const result = await purchaseRpc.call(RpcMethod.purchase.POST_PURCHASE_RETURN, params)
  return dataOf(result)?.purchase_return || null
}

export async function cancelPurchaseReturn(params = {}) {
  const result = await purchaseRpc.call(RpcMethod.purchase.CANCEL_PURCHASE_RETURN, params)
  return dataOf(result)?.purchase_return || null
}

export async function createPurchaseReceiptAdjustmentFromReceipt(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call(
    RpcMethod.purchase.CREATE_PURCHASE_RECEIPT_ADJUSTMENT_FROM_RECEIPT,
    params
  )
  return dataOf(result)?.purchase_receipt_adjustment || null
}

export async function getPurchaseReceiptAdjustment(params = {}) {
  const result = await purchaseRpc.call(
    RpcMethod.purchase.GET_PURCHASE_RECEIPT_ADJUSTMENT,
    params
  )
  return dataOf(result)?.purchase_receipt_adjustment || null
}

export async function listPurchaseReceiptAdjustments(
  params = {},
  options = {}
) {
  const result = await purchaseRpc.call(
    RpcMethod.purchase.LIST_PURCHASE_RECEIPT_ADJUSTMENTS,
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
    RpcMethod.purchase.POST_PURCHASE_RECEIPT_ADJUSTMENT,
    params
  )
  return dataOf(result)?.purchase_receipt_adjustment || null
}

export async function cancelPurchaseReceiptAdjustment(params = {}) {
  const result = await purchaseRpc.call(
    RpcMethod.purchase.CANCEL_PURCHASE_RECEIPT_ADJUSTMENT,
    params
  )
  return dataOf(result)?.purchase_receipt_adjustment || null
}

export async function createPurchaseRejectionDisposition(params = {}) {
  requirePurchaseReceiptIdempotencyKey(params.idempotency_key)
  const result = await purchaseRpc.call(
    RpcMethod.purchase.CREATE_PURCHASE_REJECTION_DISPOSITION,
    params
  )
  return dataOf(result)?.purchase_rejection_disposition || null
}

export async function postPurchaseRejectionDisposition(params = {}) {
  const result = await purchaseRpc.call(
    RpcMethod.purchase.POST_PURCHASE_REJECTION_DISPOSITION,
    params
  )
  return dataOf(result)?.purchase_rejection_disposition || null
}

export async function cancelPurchaseRejectionDisposition(params = {}) {
  const result = await purchaseRpc.call(
    RpcMethod.purchase.CANCEL_PURCHASE_REJECTION_DISPOSITION,
    params
  )
  return dataOf(result)?.purchase_rejection_disposition || null
}

export async function getPurchaseRejectionDisposition(
  params = {},
  options = {}
) {
  const result = await purchaseRpc.call(
    RpcMethod.purchase.GET_PURCHASE_REJECTION_DISPOSITION,
    params,
    options
  )
  return dataOf(result)?.purchase_rejection_disposition || null
}

export async function listPurchaseRejectionDispositions(
  params = {},
  options = {}
) {
  const result = await purchaseRpc.call(
    RpcMethod.purchase.LIST_PURCHASE_REJECTION_DISPOSITIONS,
    params,
    options
  )
  return dataOf(result)
}
