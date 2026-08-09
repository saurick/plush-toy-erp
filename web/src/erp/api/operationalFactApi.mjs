import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'
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
  url: 'operational_fact',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

export async function listProductionFacts(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'list_production_facts',
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
    'list_production_order_material_requirements',
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
    'create_production_completion_from_order',
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
    'create_production_material_issue_from_order',
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
    'create_production_rework_from_completion',
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
    'list_outsourcing_facts',
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
    'create_outsourcing_material_issue_from_order',
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
    'create_outsourcing_return_receipt_from_order',
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
    'list_outsourcing_return_dispositions',
    params,
    options
  )
  return dataOf(result)
}

export async function createOutsourcingReturnDisposition(params = {}) {
  const result = await operationalFactRpc.call(
    'create_outsourcing_return_disposition',
    params
  )
  return dataOf(result)?.outsourcing_return_disposition || null
}

export async function postOutsourcingReturnDisposition(params = {}) {
  const result = await operationalFactRpc.call(
    'post_outsourcing_return_disposition',
    params
  )
  return dataOf(result)?.outsourcing_return_disposition || null
}

export async function cancelOutsourcingReturnDisposition(params = {}) {
  const result = await operationalFactRpc.call(
    'cancel_outsourcing_return_disposition',
    params
  )
  return dataOf(result)?.outsourcing_return_disposition || null
}

export async function listProductionExceptions(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'list_production_exceptions',
    params,
    options
  )
  return dataOf(result)
}

export async function getProductionException(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'get_production_exception',
    params,
    options
  )
  return dataOf(result)?.production_exception || null
}

export async function submitProductionException(params = {}) {
  const result = await operationalFactRpc.call(
    'submit_production_exception',
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
      operationalFactRpc.call('cancel_production_exception', request),
    params
  )
}
export async function reverseProductionException(params = {}) {
  return productionExceptionResult(
    (request) =>
      operationalFactRpc.call('reverse_production_exception', request),
    params
  )
}

export async function listShipments(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'list_shipments',
    params,
    options
  )
  return dataOf(result)
}

export async function getShipment(params = {}, options = {}) {
  const result = await operationalFactRpc.call('get_shipment', params, options)
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
    'list_shipment_source_candidates',
    request,
    options
  )
  return validateShipmentSourceCandidatePage(dataOf(result), request)
}

export async function createShipmentWithItems(params = {}) {
  const result = await operationalFactRpc.call(
    'create_shipment_with_items',
    params
  )
  return dataOf(result)?.shipment || null
}

export async function saveShipmentDraft(params = {}) {
  const result = await operationalFactRpc.call('save_shipment_draft', params)
  return dataOf(result)?.shipment || null
}

export async function shipShipment(params = {}) {
  const result = await operationalFactRpc.call('ship_shipment', params)
  return dataOf(result)?.shipment || null
}

export async function cancelShipment(params = {}) {
  const result = await operationalFactRpc.call('cancel_shipment', params)
  return dataOf(result)?.shipment || null
}

export async function listStockReservations(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'list_stock_reservations',
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
    'create_stock_reservation_from_sales_order',
    params
  )
  return dataOf(result)?.stock_reservation || null
}

export async function releaseStockReservation(params = {}) {
  const result = await operationalFactRpc.call(
    'release_stock_reservation',
    params
  )
  return dataOf(result)?.stock_reservation || null
}

export async function listFinanceFacts(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'list_finance_facts',
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
    'create_receivable_from_shipment',
    params
  )
  return dataOf(result)?.finance_fact || null
}

export async function createInvoiceFromShipment(params = {}) {
  const result = await operationalFactRpc.call(
    'create_invoice_from_shipment',
    params
  )
  return dataOf(result)?.finance_fact || null
}

export async function createPayableFromPurchaseReceipt(params = {}) {
  const request = normalizePurchaseReceiptPayableRequest(params)
  const result = await operationalFactRpc.call(
    'create_payable_from_purchase_receipt',
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
    'create_payable_from_outsourcing_return',
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
    'create_reconciliation_from_finance_fact',
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
  const result = await operationalFactRpc.call('create_finance_payment', params)
  return dataOf(result)?.payment || null
}

export async function cancelFinancePayment(params = {}) {
  const result = await operationalFactRpc.call('cancel_finance_payment', params)
  return dataOf(result)?.payment || null
}

export async function reverseFinancePayment(params = {}) {
  const result = await operationalFactRpc.call(
    'reverse_finance_payment',
    params
  )
  return dataOf(result)?.payment || null
}

export async function getFinancePayment(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'get_finance_payment',
    params,
    options
  )
  return dataOf(result)?.payment || null
}

export async function listFinancePayments(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'list_finance_payments',
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
    'create_finance_credit_note',
    params
  )
  return dataOf(result)?.credit_note || null
}

export async function getFinanceCreditNote(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'get_finance_credit_note',
    params,
    options
  )
  return dataOf(result)?.credit_note || null
}

export async function listFinanceCreditNotes(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'list_finance_credit_notes',
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
    'reverse_finance_credit_note',
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
  const result = await operationalFactRpc.call('cancel_finance_fact', request)
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
