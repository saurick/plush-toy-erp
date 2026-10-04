import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc, requireRpcData as dataOf } from '@/common/utils/jsonRpc'
import {
  normalizeFinanceCancellationRequest,
  validateFinanceCancellationResult,
} from '../utils/financeCancellation.mjs'
import {
  normalizeOutsourcingReturnPayableRequest,
  normalizePurchaseReceiptPayableRequest,
  normalizeSingleFactReconciliationRequest,
  validateOutsourcingReturnPayableResult,
  validatePurchaseReceiptPayableResult,
  validateSingleFactReconciliationResult,
} from '../utils/financeBusinessSourceAction.mjs'
import { validateProductionMaterialRequirementsResponse } from '../utils/productionOrderModel.mjs'
import {
  normalizeProductionCompletionCreateRequest,
  validateProductionCompletionResult,
} from '../utils/productionCompletionAction.mjs'
import {
  normalizeProductionMaterialIssueCreateRequest,
  normalizeProductionMaterialRequirementsListRequest,
  validateProductionMaterialIssueResult,
} from '../utils/productionMaterialIssueAction.mjs'
import {
  normalizeProductionReworkRequest,
  validateProductionReworkResult,
} from '../utils/productionReworkAction.mjs'
import {
  OUTSOURCING_SOURCE_ACTIONS,
  normalizeOutsourcingSourceFactCreateRequest,
  validateOutsourcingSourceFactResult,
} from '../utils/outsourcingOrderFactAction.mjs'
import { listAllPaginatedRecords } from '../utils/referencePagination.mjs'
import { validateShipmentSourceCandidatePage } from '../utils/shipmentSourceCandidate.mjs'
import {
  normalizeOperationalFactLifecycleRequest,
  validateOperationalFactLifecycleResult,
} from '../utils/operationalFactLifecycle.mjs'
import {
  OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS,
  normalizeOutsourcingFactDraftSaveRequest,
  normalizeProductionFactDraftSaveRequest,
  validateOperationalFactDraftSaveResult,
} from '../utils/operationalFactDraftEdit.mjs'

const operationalFactRpc = new JsonRpc({
  url: RpcDomain.OPERATIONAL_FACT,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function listProductionFacts(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_PRODUCTION_FACTS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllProductionFacts(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listProductionFacts,
    params,
    'production_facts',
    options,
    {
      invalidResponseMessage: '服务器返回的生产业务记录不完整，请刷新后重试',
    }
  )
}

export async function listProductionOrderMaterialRequirements(
  params = {},
  options = {}
) {
  const request = normalizeProductionMaterialRequirementsListRequest(params)
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_PRODUCTION_ORDER_MATERIAL_REQUIREMENTS,
    request,
    options
  )
  return validateProductionMaterialRequirementsResponse(dataOf(result), {
    productionOrderID: request.production_order_id,
  })
}

export async function createProductionCompletionFromOrder(params = {}) {
  const request = normalizeProductionCompletionCreateRequest(params)
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_PRODUCTION_COMPLETION_FROM_ORDER,
    request
  )
  return validateProductionCompletionResult(
    dataOf(result)?.production_fact,
    request
  )
}

export async function createProductionMaterialIssueFromOrder(params = {}) {
  const request = normalizeProductionMaterialIssueCreateRequest(params)
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_PRODUCTION_MATERIAL_ISSUE_FROM_ORDER,
    request
  )
  return validateProductionMaterialIssueResult(
    dataOf(result)?.production_fact,
    request
  )
}

export async function createProductionReworkFromCompletion(params = {}) {
  const request = normalizeProductionReworkRequest(params)
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_PRODUCTION_REWORK_FROM_COMPLETION,
    request
  )
  return validateProductionReworkResult(
    dataOf(result)?.production_fact,
    request
  )
}

async function saveProductionFactDraft(action, params = {}, original = {}) {
  const request = normalizeProductionFactDraftSaveRequest(action, params)
  const result = await operationalFactRpc.call(action, request)
  return validateOperationalFactDraftSaveResult(
    dataOf(result)?.production_fact,
    request,
    original,
    action
  )
}

export async function saveProductionMaterialIssueDraft(
  params = {},
  original = {}
) {
  return saveProductionFactDraft(
    OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_MATERIAL_ISSUE,
    params,
    original
  )
}

export async function saveProductionCompletionDraft(
  params = {},
  original = {}
) {
  return saveProductionFactDraft(
    OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION,
    params,
    original
  )
}

export async function saveProductionReworkFromCompletionDraft(
  params = {},
  original = {}
) {
  return saveProductionFactDraft(
    OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_REWORK_COMPLETION,
    params,
    original
  )
}

export async function postProductionFact(params = {}) {
  return runOperationalFactLifecycle({
    method: 'post_production_fact',
    resultKey: 'production_fact',
    targetStatus: 'POSTED',
    params,
  })
}

export async function cancelProductionFact(params = {}) {
  return runOperationalFactLifecycle({
    method: 'cancel_production_fact',
    resultKey: 'production_fact',
    targetStatus: 'CANCELLED',
    params,
    requireReason: true,
  })
}

export async function listOutsourcingFacts(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_OUTSOURCING_FACTS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllOutsourcingFacts(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listOutsourcingFacts,
    params,
    'outsourcing_facts',
    options,
    {
      invalidResponseMessage: '服务器返回的委外业务记录不完整，请刷新后重试',
    }
  )
}

export async function createOutsourcingMaterialIssueFromOrder(params = {}) {
  const actionType = OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE
  const request = normalizeOutsourcingSourceFactCreateRequest(
    actionType,
    params
  )
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_OUTSOURCING_MATERIAL_ISSUE_FROM_ORDER,
    request
  )
  return validateOutsourcingSourceFactResult(
    dataOf(result)?.outsourcing_fact,
    actionType,
    { id: request.outsourcing_order_id },
    { id: request.outsourcing_order_item_id, subject_type: 'MATERIAL' },
    request
  )
}

export async function createOutsourcingReturnReceiptFromOrder(params = {}) {
  const actionType = OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT
  const request = normalizeOutsourcingSourceFactCreateRequest(
    actionType,
    params
  )
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_OUTSOURCING_RETURN_RECEIPT_FROM_ORDER,
    request
  )
  return validateOutsourcingSourceFactResult(
    dataOf(result)?.outsourcing_fact,
    actionType,
    { id: request.outsourcing_order_id },
    { id: request.outsourcing_order_item_id, subject_type: 'PRODUCT' },
    request
  )
}

async function saveOutsourcingFactDraft(action, params = {}, original = {}) {
  const request = normalizeOutsourcingFactDraftSaveRequest(action, params)
  const result = await operationalFactRpc.call(action, request)
  return validateOperationalFactDraftSaveResult(
    dataOf(result)?.outsourcing_fact,
    request,
    original,
    action
  )
}

export async function saveOutsourcingMaterialIssueDraft(
  params = {},
  original = {}
) {
  return saveOutsourcingFactDraft(
    OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.OUTSOURCING_MATERIAL_ISSUE,
    params,
    original
  )
}

export async function saveOutsourcingReturnReceiptDraft(
  params = {},
  original = {}
) {
  return saveOutsourcingFactDraft(
    OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.OUTSOURCING_RETURN_RECEIPT,
    params,
    original
  )
}

export async function postOutsourcingFact(params = {}) {
  return runOperationalFactLifecycle({
    method: 'post_outsourcing_fact',
    resultKey: 'outsourcing_fact',
    targetStatus: 'POSTED',
    params,
  })
}

export async function cancelOutsourcingFact(params = {}) {
  return runOperationalFactLifecycle({
    method: 'cancel_outsourcing_fact',
    resultKey: 'outsourcing_fact',
    targetStatus: 'CANCELLED',
    params,
    requireReason: true,
  })
}

export async function listOutsourcingReturnDispositions(
  params = {},
  options = {}
) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_OUTSOURCING_RETURN_DISPOSITIONS,
    params,
    options
  )
  return dataOf(result)
}

export async function createOutsourcingReturnDisposition(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_OUTSOURCING_RETURN_DISPOSITION,
    params
  )
  return dataOf(result)?.outsourcing_return_disposition || null
}

export async function postOutsourcingReturnDisposition(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.POST_OUTSOURCING_RETURN_DISPOSITION,
    params
  )
  return dataOf(result)?.outsourcing_return_disposition || null
}

export async function cancelOutsourcingReturnDisposition(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CANCEL_OUTSOURCING_RETURN_DISPOSITION,
    params
  )
  return dataOf(result)?.outsourcing_return_disposition || null
}

export async function listProductionExceptions(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_PRODUCTION_EXCEPTIONS,
    params,
    options
  )
  return dataOf(result)
}

export async function getProductionException(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.GET_PRODUCTION_EXCEPTION,
    params,
    options
  )
  return dataOf(result)?.production_exception || null
}

export async function submitProductionException(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.SUBMIT_PRODUCTION_EXCEPTION,
    params
  )
  return dataOf(result)?.production_exception || null
}

async function productionExceptionResult(method, params) {
  const result = await method(params)
  return dataOf(result)?.production_exception || null
}
export async function cancelProductionException(params = {}) {
  return productionExceptionResult(
    (request) =>
      operationalFactRpc.call(RpcMethod.operational_fact.CANCEL_PRODUCTION_EXCEPTION, request),
    params
  )
}
export async function reverseProductionException(params = {}) {
  return productionExceptionResult(
    (request) =>
      operationalFactRpc.call(RpcMethod.operational_fact.REVERSE_PRODUCTION_EXCEPTION, request),
    params
  )
}

export async function listShipments(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_SHIPMENTS,
    params,
    options
  )
  return dataOf(result)
}

export async function getShipment(params = {}, options = {}) {
  const result = await operationalFactRpc.call(RpcMethod.operational_fact.GET_SHIPMENT, params, options)
  return dataOf(result)?.shipment || null
}

export async function listAllShipments(params = {}, options = {}) {
  return listAllPaginatedRecords(listShipments, params, 'shipments', options, {
    invalidResponseMessage: '服务器返回的出货记录不完整，请刷新后重试',
  })
}

export async function listShipmentSourceCandidates(params = {}, options = {}) {
  const request = { limit: 50, offset: 0, ...params }
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_SHIPMENT_SOURCE_CANDIDATES,
    request,
    options
  )
  return validateShipmentSourceCandidatePage(dataOf(result), request)
}

export async function createShipmentWithItems(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_SHIPMENT_WITH_ITEMS,
    params
  )
  return dataOf(result)?.shipment || null
}

export async function saveShipmentDraft(params = {}) {
  const result = await operationalFactRpc.call(RpcMethod.operational_fact.SAVE_SHIPMENT_DRAFT, params)
  return dataOf(result)?.shipment || null
}

export async function shipShipment(params = {}) {
  const result = await operationalFactRpc.call(RpcMethod.operational_fact.SHIP_SHIPMENT, params)
  return dataOf(result)?.shipment || null
}

export async function cancelShipment(params = {}) {
  const result = await operationalFactRpc.call(RpcMethod.operational_fact.CANCEL_SHIPMENT, params)
  return dataOf(result)?.shipment || null
}

export async function listStockReservations(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_STOCK_RESERVATIONS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllStockReservations(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listStockReservations,
    params,
    'stock_reservations',
    options,
    {
      invalidResponseMessage: '服务器返回的库存预留记录不完整，请刷新后重试',
    }
  )
}

export async function createStockReservationFromSalesOrder(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_STOCK_RESERVATION_FROM_SALES_ORDER,
    params
  )
  return dataOf(result)?.stock_reservation || null
}

export async function releaseStockReservation(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.RELEASE_STOCK_RESERVATION,
    params
  )
  return dataOf(result)?.stock_reservation || null
}

export async function listFinanceFacts(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_FINANCE_FACTS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllFinanceFacts(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listFinanceFacts,
    params,
    'finance_facts',
    options,
    {
      invalidResponseMessage: '服务器返回的应收应付记录不完整，请刷新后重试',
    }
  )
}

export async function createReceivableFromShipment(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_RECEIVABLE_FROM_SHIPMENT,
    params
  )
  return dataOf(result)?.finance_fact || null
}

export async function createInvoiceFromShipment(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_INVOICE_FROM_SHIPMENT,
    params
  )
  return dataOf(result)?.finance_fact || null
}

export async function createPayableFromPurchaseReceipt(params = {}) {
  const request = normalizePurchaseReceiptPayableRequest(params)
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_PAYABLE_FROM_PURCHASE_RECEIPT,
    request
  )
  return validatePurchaseReceiptPayableResult(
    dataOf(result)?.finance_fact,
    request
  )
}

export async function createPayableFromOutsourcingReturn(params = {}) {
  const request = normalizeOutsourcingReturnPayableRequest(params)
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_PAYABLE_FROM_OUTSOURCING_RETURN,
    request
  )
  return validateOutsourcingReturnPayableResult(
    dataOf(result)?.finance_fact,
    request
  )
}

export async function createReconciliationFromFinanceFact(params = {}) {
  const request = normalizeSingleFactReconciliationRequest(params)
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_RECONCILIATION_FROM_FINANCE_FACT,
    request
  )
  return validateSingleFactReconciliationResult(
    dataOf(result)?.finance_fact,
    request
  )
}

export async function postFinanceFact(params = {}) {
  return runOperationalFactLifecycle({
    method: 'post_finance_fact',
    resultKey: 'finance_fact',
    targetStatus: 'POSTED',
    params,
  })
}

export async function createFinancePayment(params = {}) {
  const result = await operationalFactRpc.call(RpcMethod.operational_fact.CREATE_FINANCE_PAYMENT, params)
  return dataOf(result)?.payment || null
}

export async function cancelFinancePayment(params = {}) {
  const result = await operationalFactRpc.call(RpcMethod.operational_fact.CANCEL_FINANCE_PAYMENT, params)
  return dataOf(result)?.payment || null
}

export async function reverseFinancePayment(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.REVERSE_FINANCE_PAYMENT,
    params
  )
  return dataOf(result)?.payment || null
}

export async function getFinancePayment(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.GET_FINANCE_PAYMENT,
    params,
    options
  )
  return dataOf(result)?.payment || null
}

export async function listFinancePayments(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_FINANCE_PAYMENTS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllFinancePayments(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listFinancePayments,
    params,
    'payments',
    options,
    {
      invalidResponseMessage: '服务器返回的收付款记录不完整，请刷新后重试',
    }
  )
}

export async function createFinanceCreditNote(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.CREATE_FINANCE_CREDIT_NOTE,
    params
  )
  return dataOf(result)?.credit_note || null
}

export async function getFinanceCreditNote(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.GET_FINANCE_CREDIT_NOTE,
    params,
    options
  )
  return dataOf(result)?.credit_note || null
}

export async function listFinanceCreditNotes(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.LIST_FINANCE_CREDIT_NOTES,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllFinanceCreditNotes(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listFinanceCreditNotes,
    params,
    'credit_notes',
    options,
    {
      invalidResponseMessage: '服务器返回的红冲记录不完整，请刷新后重试',
    }
  )
}

export async function reverseFinanceCreditNote(params = {}) {
  const result = await operationalFactRpc.call(
    RpcMethod.operational_fact.REVERSE_FINANCE_CREDIT_NOTE,
    params
  )
  return dataOf(result)?.credit_note || null
}

export async function settleFinanceFact(params = {}) {
  return runOperationalFactLifecycle({
    method: 'settle_finance_fact',
    resultKey: 'finance_fact',
    targetStatus: 'SETTLED',
    params,
  })
}

export async function cancelFinanceFact(params = {}) {
  const request = normalizeFinanceCancellationRequest(params)
  const result = await operationalFactRpc.call(RpcMethod.operational_fact.CANCEL_FINANCE_FACT, request)
  return validateFinanceCancellationResult(
    dataOf(result)?.finance_fact,
    request
  )
}

async function runOperationalFactLifecycle({
  method,
  resultKey,
  targetStatus,
  params,
  requireReason = false,
}) {
  const request = normalizeOperationalFactLifecycleRequest(params, {
    requireReason,
  })
  const result = await operationalFactRpc.call(method, request)
  return validateOperationalFactLifecycleResult(
    dataOf(result)?.[resultKey],
    request,
    targetStatus
  )
}
