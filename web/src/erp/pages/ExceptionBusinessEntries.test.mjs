import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const router = read('../router.jsx')
const inventoryPage = read('./V1InventoryLedgerPage.jsx')
const inventoryModal = read(
  '../components/inventory/InventoryOperationModal.jsx'
)
const qualityPage = read('./V1QualityInspectionsPage.jsx')
const rejectionModal = read(
  '../components/quality-inspections/PurchaseRejectionDispositionModal.jsx'
)
const salesReturnsPage = read('./SalesReturnsPage.jsx')
const financePaymentsPage = read('./FinancePaymentsPage.jsx')

test('exception entries: router exposes formal RMA and payment pages', () => {
  assert.match(router, /path="sales\/customer-returns"/u)
  assert.match(router, /element=\{<SalesReturnsPage \/>\}/u)
  assert.match(router, /path="finance\/payments"/u)
  assert.match(router, /element=\{<FinancePaymentsPage \/>\}/u)
})

test('inventory operations: support the three controlled types and reconcile uncertain writes', () => {
  for (const type of ['CYCLE_COUNT', 'TRANSFER', 'MANUAL_ADJUSTMENT']) {
    assert.match(inventoryModal, new RegExp(type, 'u'))
  }
  assert.match(inventoryPage, /createSourceBusinessActionAttemptStore/u)
  assert.match(inventoryPage, /expected_version:/u)
  assert.match(inventoryPage, /getInventoryOperation/u)
  assert.match(inventoryPage, /warehouse\.adjustment\.create/u)
  assert.doesNotMatch(inventoryModal, /客户ID|仓库ID|主体ID/u)
})

test('first incoming rejection: keeps draft, post and cancellation distinct from stocked returns', () => {
  assert.match(qualityPage, /首次来料退厂/u)
  assert.match(rejectionModal, /createPurchaseRejectionDisposition/u)
  assert.match(rejectionModal, /postPurchaseRejectionDisposition/u)
  assert.match(rejectionModal, /cancelPurchaseRejectionDisposition/u)
  assert.match(rejectionModal, /不会生成库存退货流水/u)
  assert.match(rejectionModal, /createSourceBusinessActionAttemptStore/u)
  assert.match(rejectionModal, /expected_version: record\.version/u)
})

test('RMA: uses shipment source, optimistic version and inventory-writing receive boundary', () => {
  assert.match(salesReturnsPage, /listSalesReturns/u)
  assert.match(salesReturnsPage, /listAllShipments/u)
  assert.match(salesReturnsPage, /shipmentData\?\.shipments/u)
  assert.match(salesReturnsPage, /expected_version:/u)
  assert.match(salesReturnsPage, /createSourceBusinessActionAttemptStore/u)
  assert.match(salesReturnsPage, /只有收货会写入退回库存/u)
  assert.doesNotMatch(salesReturnsPage, /客户ID|出货ID|明细ID/u)
})

test('finance V1: lists real payments, allocates multiple facts and preserves reversal audit', () => {
  assert.match(financePaymentsPage, /listFinancePayments/u)
  assert.match(financePaymentsPage, /customerRows\?\.customers/u)
  assert.match(financePaymentsPage, /supplierRows\?\.suppliers/u)
  assert.match(financePaymentsPage, /Form\.List name="allocations"/u)
  assert.match(financePaymentsPage, /expected_version:/u)
  assert.match(financePaymentsPage, /reverseFinancePayment/u)
  assert.match(financePaymentsPage, /createFinanceCreditNote/u)
  assert.match(financePaymentsPage, /reverseFinanceCreditNote/u)
  assert.match(financePaymentsPage, /不会删除原记录/u)
  assert.doesNotMatch(financePaymentsPage, /客户ID|供应商ID|财务记录ID/u)
})
