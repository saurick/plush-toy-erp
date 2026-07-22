import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./operationalFactApi.mjs', import.meta.url)),
  'utf8'
)

test('operationalFactApi: uses dedicated operational fact JSON-RPC domain and admin auth', () => {
  assert.match(source, /url:\s*'operational_fact'/)
  assert.match(source, /authScope:\s*AUTH_SCOPE\.ADMIN/)
})

test('operationalFactApi: exposes production, outsourcing, shipment, reservation and finance methods', () => {
  for (const methodName of [
    'list_production_facts',
    'list_production_order_material_requirements',
    'create_production_completion_from_order',
    'create_production_material_issue_from_order',
    'create_production_rework_from_completion',
    'post_production_fact',
    'cancel_production_fact',
    'list_outsourcing_facts',
    'create_outsourcing_material_issue_from_order',
    'create_outsourcing_return_receipt_from_order',
    'post_outsourcing_fact',
    'cancel_outsourcing_fact',
    'get_shipment',
    'list_shipments',
    'list_shipment_source_candidates',
    'create_shipment_with_items',
    'submit_shipment_release',
    'ship_shipment',
    'cancel_shipment',
    'list_stock_reservations',
    'create_stock_reservation_from_sales_order',
    'release_stock_reservation',
    'list_finance_facts',
    'create_receivable_from_shipment',
    'create_invoice_from_shipment',
    'create_payable_from_purchase_receipt',
    'create_payable_from_outsourcing_return',
    'create_reconciliation_from_finance_fact',
    'post_finance_fact',
    'settle_finance_fact',
    'cancel_finance_fact',
    'list_sales_returns',
    'create_sales_return',
    'approve_sales_return',
    'receive_sales_return',
    'cancel_sales_return',
    'get_sales_return',
    'list_finance_payments',
    'get_finance_credit_note',
    'list_finance_credit_notes',
    'create_finance_payment',
    'post_finance_payment',
    'reverse_finance_payment',
    'get_finance_payment',
    'create_finance_credit_note',
    'reverse_finance_credit_note',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }

  assert.doesNotMatch(source, /consume_stock_reservation/)
  assert.doesNotMatch(source, /call\(\s*'create_outsourcing_fact'\s*,/)
  assert.doesNotMatch(
    source,
    /export async function createOutsourcingFact\s*\(/
  )
  assert.doesNotMatch(source, /call\(\s*'create_stock_reservation'\s*,/)
  assert.doesNotMatch(
    source,
    /export async function createStockReservation\s*\(/
  )
  assert.doesNotMatch(source, /call\(\s*'create_finance_fact'/)
  assert.doesNotMatch(source, /call\(\s*'create_shipment'/)
  assert.doesNotMatch(source, /call\(\s*'add_shipment_item'/)

  for (const forbiddenName of [
    'business_records',
    'workflow_task',
    'generateReceivable',
    'generateInvoice',
    'postGeneralLedger',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbiddenName))
  }
})

test('operationalFactApi: outsourcing related records use strict complete pagination', () => {
  assert.match(
    source,
    /export async function listAllOutsourcingFacts\([\s\S]*?listAllPaginatedRecords\(\s*listOutsourcingFacts,\s*params,\s*'outsourcing_facts'/u
  )
})

test('operationalFactApi: source-derived fact reads use strict complete pagination', () => {
  for (const [functionName, pageFunction, recordKey] of [
    ['listAllProductionFacts', 'listProductionFacts', 'production_facts'],
    ['listAllShipments', 'listShipments', 'shipments'],
    ['listAllStockReservations', 'listStockReservations', 'stock_reservations'],
  ]) {
    assert.match(
      source,
      new RegExp(
        `export async function ${functionName}\\([\\s\\S]*?listAllPaginatedRecords\\(\\s*${pageFunction},\\s*params,\\s*'${recordKey}'`,
        'u'
      )
    )
  }
})

test('operationalFactApi: shipment source candidates use the typed server contract', () => {
  assert.match(
    source,
    /export async function listShipmentSourceCandidates[\s\S]*?'list_shipment_source_candidates'[\s\S]*?validateShipmentSourceCandidatePage/u
  )
})

test('operationalFactApi: shipment detail uses the exact read contract', () => {
  assert.match(
    source,
    /export async function getShipment[\s\S]*?'get_shipment'[\s\S]*?dataOf\(result\)\?\.shipment \|\| null/u
  )
})

test('operationalFactApi: production material issue uses strict source contracts', () => {
  assert.match(
    source,
    /export async function createProductionCompletionFromOrder[\s\S]*normalizeProductionCompletionCreateRequest\(params\)[\s\S]*'create_production_completion_from_order'[\s\S]*validateProductionCompletionResult/u
  )
  assert.match(
    source,
    /export async function listProductionOrderMaterialRequirements[\s\S]*normalizeProductionMaterialRequirementsListRequest\(params\)[\s\S]*'list_production_order_material_requirements'[\s\S]*validateProductionMaterialRequirementsResponse/u
  )
  assert.match(
    source,
    /export async function createProductionMaterialIssueFromOrder[\s\S]*normalizeProductionMaterialIssueCreateRequest\(params\)[\s\S]*'create_production_material_issue_from_order'[\s\S]*validateProductionMaterialIssueResult/u
  )
  assert.doesNotMatch(
    source,
    /export async function createProductionMaterialIssueFromOrder[\s\S]*create_production_fact/u
  )
})

test('operationalFactApi: production rework uses the strict completion source contract', () => {
  assert.match(
    source,
    /export async function createProductionReworkFromCompletion[\s\S]*normalizeProductionReworkRequest\(params\)[\s\S]*'create_production_rework_from_completion'[\s\S]*validateProductionReworkResult/u
  )
  assert.doesNotMatch(
    source,
    /export async function createProductionReworkFromCompletion[\s\S]*create_production_fact/u
  )
})

test('operationalFactApi: shipment release uses the strict source task contract', () => {
  assert.match(
    source,
    /export async function submitShipmentRelease[\s\S]*normalizeShipmentReleaseTaskRequest\(params\)[\s\S]*'submit_shipment_release'[\s\S]*validateShipmentReleaseTaskResult/u
  )
})

test('operationalFactApi: outsourcing creation only exposes source-bound commands', () => {
  assert.match(
    source,
    /export async function createOutsourcingMaterialIssueFromOrder[\s\S]*normalizeOutsourcingSourceFactCreateRequest[\s\S]*'create_outsourcing_material_issue_from_order'[\s\S]*validateOutsourcingSourceFactResult/u
  )
  assert.match(
    source,
    /export async function createOutsourcingReturnReceiptFromOrder[\s\S]*normalizeOutsourcingSourceFactCreateRequest[\s\S]*'create_outsourcing_return_receipt_from_order'[\s\S]*validateOutsourcingSourceFactResult/u
  )
})

test('operationalFactApi: sales order reservation creation uses the source-bound RPC', () => {
  assert.match(
    source,
    /export async function createStockReservationFromSalesOrder[\s\S]*'create_stock_reservation_from_sales_order'[\s\S]*dataOf\(result\)\?\.stock_reservation \|\| null/u
  )
})

test('operationalFactApi: source finance creation returns the finance fact payload', () => {
  assert.match(
    source,
    /export async function createReceivableFromShipment[\s\S]*'create_receivable_from_shipment'[\s\S]*dataOf\(result\)\?\.finance_fact \|\| null/u
  )
  assert.match(
    source,
    /export async function createInvoiceFromShipment[\s\S]*'create_invoice_from_shipment'[\s\S]*dataOf\(result\)\?\.finance_fact \|\| null/u
  )
  assert.match(
    source,
    /export async function createPayableFromPurchaseReceipt[\s\S]*normalizePurchaseReceiptPayableRequest\(params\)[\s\S]*'create_payable_from_purchase_receipt'[\s\S]*validatePurchaseReceiptPayableResult/u
  )
  assert.match(
    source,
    /export async function createPayableFromOutsourcingReturn[\s\S]*normalizeOutsourcingReturnPayableRequest\(params\)[\s\S]*'create_payable_from_outsourcing_return'[\s\S]*validateOutsourcingReturnPayableResult/u
  )
  assert.match(
    source,
    /export async function createReconciliationFromFinanceFact[\s\S]*normalizeSingleFactReconciliationRequest\(params\)[\s\S]*'create_reconciliation_from_finance_fact'[\s\S]*validateSingleFactReconciliationResult/u
  )
})
