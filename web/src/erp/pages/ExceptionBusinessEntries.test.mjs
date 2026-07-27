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
const productionExceptionPanel = read(
  '../components/production-exceptions/ProductionExceptionDecisionPanel.jsx'
)
const processRecoveryButton = read(
  '../components/workflow/ExceptionProcessRecoveryButton.jsx'
)

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
  assert.match(qualityPage, /selectedDispositionKind === 'incoming-rejection'/u)
  assert.match(qualityPage, /setRejectionDispositionOpen\(true\)/u)
  assert.match(qualityPage, />\s*不合格处置\s*</u)
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
  assert.match(salesReturnsPage, /reverseSalesReturn/u)
  assert.match(salesReturnsPage, /入库后只能冲正/u)
  assert.match(salesReturnsPage, /getSalesReturnAcceptanceProcess/u)
  assert.match(salesReturnsPage, /startSalesReturnAcceptanceProcess/u)
  assert.match(salesReturnsPage, />\s*核对审批流\s*</u)
  assert.doesNotMatch(salesReturnsPage, /客户ID|出货ID|明细ID/u)
})

test('finance V1: lists real payments, allocates multiple facts and preserves reversal audit', () => {
  assert.match(financePaymentsPage, /listFinancePayments/u)
  assert.match(financePaymentsPage, /customerRows\?\.customers/u)
  assert.match(financePaymentsPage, /supplierRows\?\.suppliers/u)
  assert.match(financePaymentsPage, /Form\.List name="allocations"/u)
  assert.match(
    financePaymentsPage,
    /const initializeAllocationForm = \(visible\) => \{[\s\S]*if \(!visible\) return[\s\S]*allocationForm\.resetFields\(\)[\s\S]*allocationForm\.setFieldsValue\([\s\S]*afterOpenChange=\{initializeAllocationForm\}/u
  )
  assert.doesNotMatch(
    financePaymentsPage,
    /const openAllocation = \(\) => \{[^}]*allocationForm\.setFieldsValue/u
  )
  assert.doesNotMatch(
    financePaymentsPage,
    /form=\{allocationForm\}[\s\S]{0,100}preserve=\{false\}/u
  )
  assert.match(financePaymentsPage, /expected_version:/u)
  assert.match(financePaymentsPage, /reverseFinancePayment/u)
  assert.match(financePaymentsPage, /createFinanceCreditNote/u)
  assert.match(financePaymentsPage, /reverseFinanceCreditNote/u)
  assert.match(financePaymentsPage, /不会删除原记录/u)
  assert.match(financePaymentsPage, /getFinancePaymentApprovalProcess/u)
  assert.match(financePaymentsPage, /startFinancePaymentApprovalProcess/u)
  assert.match(financePaymentsPage, />\s*核对审批流\s*</u)
  assert.doesNotMatch(financePaymentsPage, /客户ID|供应商ID|财务记录ID/u)
})

test('production exception: requester can reconcile a submitted source whose process start was not confirmed', () => {
  assert.match(productionExceptionPanel, /getProductionExceptionApprovalProcess/u)
  assert.match(
    productionExceptionPanel,
    /startProductionExceptionApprovalProcess/u
  )
  assert.match(productionExceptionPanel, /record\.requested_by/u)
  assert.match(productionExceptionPanel, />\s*核对审批流\s*</u)
})

test('exception recovery: system permission gates one evidence-bound shared recovery action', () => {
  for (const source of [
    inventoryPage,
    salesReturnsPage,
    financePaymentsPage,
    productionExceptionPanel,
  ]) {
    assert.match(source, /ExceptionProcessRecoveryButton/u)
    assert.match(source, /process_runtime\.recover/u)
  }
  assert.match(processRecoveryButton, /findExceptionProcessRecoveryCandidate/u)
  assert.match(processRecoveryButton, /recoverCompensatedProcessDomainCommand/u)
  assert.match(
    processRecoveryButton,
    /exceptionProcessRecoveryReadbackMatches/u
  )
  assert.match(processRecoveryButton, /终止异常流程并撤回下游待办/u)
  assert.doesNotMatch(processRecoveryButton, /领域命令|数据库结构|RPC|RBAC/u)
})
