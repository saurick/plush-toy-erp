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
const reworkIntakesPage = read('./ReworkIntakesPage.jsx')
const financePaymentsPage = read('./FinancePaymentsPage.jsx')
const productionExceptionPanel = read(
  '../components/production-exceptions/ProductionExceptionDecisionPanel.jsx'
)
const processRecoveryButton = read(
  '../components/workflow/ExceptionProcessRecoveryButton.jsx'
)

test('exception entries: router exposes formal rework-intake and payment pages', () => {
  assert.match(router, /path="sales\/rework-intakes"/u)
  assert.match(router, /element=\{<ReworkIntakesPage \/>\}/u)
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

test('返工回厂：来源、收货、生产返工、质检完工和补发保持同一追溯链', () => {
  for (const contract of [
    'listReworkIntakes',
    'listAllReworkIntakeSourceCandidates',
    'createReworkIntake',
    'receiveReworkIntake',
    'reverseReworkIntake',
    'createProductionReworkFromIntake',
    'createReworkReshipment',
  ]) {
    assert.match(reworkIntakesPage, new RegExp(contract, 'u'))
  }
  assert.match(reworkIntakesPage, /expected_version:/u)
  assert.match(reworkIntakesPage, /REWORK_RESHIPMENT|返工补发/u)
  assert.match(reworkIntakesPage, /不产生新的销售应收或开票/u)
  assert.match(reworkIntakesPage, /BusinessDataTable/u)
  assert.match(reworkIntakesPage, /BusinessFormModal/u)
  assert.match(reworkIntakesPage, /BusinessRecordDetailsModal/u)
  for (const actionKey of [
    'rework-intake-receive',
    'rework-intake-create-rework',
    'rework-intake-create-reshipment',
    'rework-intake-cancel',
    'rework-intake-reverse',
  ]) {
    assert.match(reworkIntakesPage, new RegExp(actionKey, 'u'))
  }
  assert.doesNotMatch(reworkIntakesPage, /客户ID|出货ID|明细ID/u)
})

test('finance V1: lists real payments, allocates multiple facts and preserves reversal audit', () => {
  assert.match(financePaymentsPage, /listFinancePayments/u)
  assert.match(financePaymentsPage, /listAllFinanceFacts/u)
  assert.match(financePaymentsPage, /Promise\.allSettled/u)
  assert.match(financePaymentsPage, /BusinessOperationPanel/u)
  assert.match(financePaymentsPage, /BusinessDataTable/u)
  assert.match(financePaymentsPage, /BusinessFormModal/u)
  assert.match(financePaymentsPage, /BusinessRecordDetailsModal/u)
  assert.match(financePaymentsPage, /createBusinessTablePagination/u)
  assert.match(financePaymentsPage, /outstanding_amount/u)
  assert.match(financePaymentsPage, /validateFinanceAllocationDraft/u)
  assert.match(financePaymentsPage, /validateFinanceCreditDraft/u)
  assert.match(financePaymentsPage, /compareNumeric20Scale6Values/u)
  assert.doesNotMatch(
    financePaymentsPage,
    /Number\(credit\?\.amount\)\s*===\s*Number\(payload\.amount\)/u
  )
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
  assert.match(financePaymentsPage, /不(?:会)?删除原记录/u)
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
    financePaymentsPage,
    productionExceptionPanel,
  ]) {
    assert.match(source, /ExceptionProcessRecoveryButton/u)
    assert.match(source, /process_runtime\.recover/u)
  }
  assert.match(processRecoveryButton, /findExceptionProcessRecoveryCandidate/u)
  assert.match(processRecoveryButton, /getProcessRecoveryContext/u)
  assert.match(processRecoveryButton, /recoverCompensatedProcessDomainCommand/u)
  assert.match(
    processRecoveryButton,
    /exceptionProcessRecoveryReadbackMatches/u
  )
  assert.match(processRecoveryButton, /终止异常流程并撤回下游待办/u)
  assert.doesNotMatch(processRecoveryButton, /领域命令|数据库结构|RPC|RBAC/u)
})
