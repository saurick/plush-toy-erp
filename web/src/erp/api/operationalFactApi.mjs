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
  normalizeShipmentReleaseTaskRequest,
  validateShipmentReleaseTaskResult,
} from '../utils/workflowSourceTask.mjs'
import {
  OUTSOURCING_SOURCE_ACTIONS,
  normalizeOutsourcingSourceFactCreateRequest,
  validateOutsourcingSourceFactResult,
} from '../utils/outsourcingOrderFactAction.mjs'
import { listAllPaginatedRecords } from '../utils/referencePagination.mjs'
import { validateShipmentSourceCandidatePage } from '../utils/shipmentSourceCandidate.mjs'

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

export async function postProductionFact(params = {}) {
  const result = await operationalFactRpc.call('post_production_fact', params)
  return dataOf(result)?.production_fact || null
}

export async function cancelProductionFact(params = {}) {
  const result = await operationalFactRpc.call('cancel_production_fact', params)
  return dataOf(result)?.production_fact || null
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

export async function postOutsourcingFact(params = {}) {
  const result = await operationalFactRpc.call('post_outsourcing_fact', params)
  return dataOf(result)?.outsourcing_fact || null
}

export async function cancelOutsourcingFact(params = {}) {
  const result = await operationalFactRpc.call(
    'cancel_outsourcing_fact',
    params
  )
  return dataOf(result)?.outsourcing_fact || null
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

export async function submitShipmentRelease(params = {}) {
  const request = normalizeShipmentReleaseTaskRequest(params)
  const result = await operationalFactRpc.call(
    'submit_shipment_release',
    request
  )
  return validateShipmentReleaseTaskResult(dataOf(result), request)
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

export async function listFinanceFacts(params = {}) {
  const result = await operationalFactRpc.call('list_finance_facts', params)
  return dataOf(result)
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
  const result = await operationalFactRpc.call('post_finance_fact', params)
  return dataOf(result)?.finance_fact || null
}

export async function listSalesReturns(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'list_sales_returns',
    params,
    options
  )
  return dataOf(result)
}

export async function createSalesReturn(params = {}) {
  const result = await operationalFactRpc.call('create_sales_return', params)
  return dataOf(result)?.sales_return || null
}

export async function approveSalesReturn(params = {}) {
  const result = await operationalFactRpc.call('approve_sales_return', params)
  return dataOf(result)?.sales_return || null
}

export async function receiveSalesReturn(params = {}) {
  const result = await operationalFactRpc.call('receive_sales_return', params)
  return dataOf(result)?.sales_return || null
}

export async function cancelSalesReturn(params = {}) {
  const result = await operationalFactRpc.call('cancel_sales_return', params)
  return dataOf(result)?.sales_return || null
}

export async function getSalesReturn(params = {}, options = {}) {
  const result = await operationalFactRpc.call(
    'get_sales_return',
    params,
    options
  )
  return dataOf(result)?.sales_return || null
}

export async function createFinancePayment(params = {}) {
  const result = await operationalFactRpc.call('create_finance_payment', params)
  return dataOf(result)?.payment || null
}

export async function postFinancePayment(params = {}) {
  const result = await operationalFactRpc.call('post_finance_payment', params)
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

export async function reverseFinanceCreditNote(params = {}) {
  const result = await operationalFactRpc.call(
    'reverse_finance_credit_note',
    params
  )
  return dataOf(result)?.credit_note || null
}

export async function settleFinanceFact(params = {}) {
  const result = await operationalFactRpc.call('settle_finance_fact', params)
  return dataOf(result)?.finance_fact || null
}

export async function cancelFinanceFact(params = {}) {
  const request = normalizeFinanceCancellationRequest(params)
  const result = await operationalFactRpc.call('cancel_finance_fact', request)
  return validateFinanceCancellationResult(
    dataOf(result)?.finance_fact,
    request
  )
}
