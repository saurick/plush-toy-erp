import assert from 'node:assert/strict'

import test from 'node:test'
import { readContractSource as readFileSync } from '../../../scripts/test/publicContractSource.mjs'

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const router = read('../router.jsx')
const inventoryPage = read('./InventoryLedgerPage.jsx')
const inventoryModal = read(
  '../components/inventory/InventoryOperationModal.jsx'
)
const qualityPage = read('./QualityInspectionsPage.jsx')
const rejectionModal = read(
  '../components/quality-inspections/PurchaseRejectionDispositionModal.jsx'
)
const financePaymentsPage = read('./FinancePaymentsPage.jsx')
const financeRecords = read('../components/finance/useFinancePaymentRecords.mjs')
const financeAllocation = read('../components/finance/useFinancePaymentAllocation.mjs')
const financeAllocationEditor = read('../components/finance/FinanceAllocationEditor.jsx')
const financeAdjustments = read('../components/finance/useFinancePaymentAdjustments.mjs')
const financeCreditActions = read('../components/finance/useFinanceCreditActions.mjs')
const financeCreation = read('../components/finance/useFinancePaymentCreation.mjs')
const financeDetails = read('../components/finance/FinancePaymentDetails.jsx')
const financeCreditSubmission = read('../utils/financeCreditSubmission.mjs')
const productionExceptionPanel = read(
  '../components/production-exceptions/ProductionExceptionDecisionPanel.jsx'
)
const processRecoveryButton = read(
  '../components/workflow/ExceptionProcessRecoveryButton.jsx'
)

test('exception entries: router exposes the formal payment page', () => {
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
  assert.match(rejectionModal, /不生成库存退货流水/u)
  assert.match(rejectionModal, /createSourceBusinessActionAttemptStore/u)
  assert.match(rejectionModal, /expected_version: record\.version/u)
})

test('finance payments: lists real payments, allocates multiple facts and preserves reversal audit', () => {
  assert.match(financeRecords, /listFinancePayments/u)
  assert.match(financeRecords, /listAllFinanceFacts/u)
  assert.match(financeRecords, /Promise\.allSettled/u)
  assert.match(financePaymentsPage, /BusinessOperationPanel/u)
  assert.match(financePaymentsPage, /BusinessDataTable/u)
  assert.match(financeAllocationEditor, /BusinessFormModal/u)
  assert.match(financeDetails, /BusinessDetailsModal/u)
  assert.match(financePaymentsPage, /createBusinessTablePagination/u)
  assert.match(financeRecords, /outstanding_amount/u)
  assert.match(financeAllocation, /validateFinanceAllocationDraft/u)
  assert.match(financeCreditActions, /command = buildFinanceCreditCommand\(/u)
  assert.match(financeCreditActions, /await executeFinanceCreditCommand\(/u)
  assert.match(financeCreditSubmission, /validateFinanceCreditDraft/u)
  assert.match(financeCreditSubmission, /compareNumeric20Scale6Values/u)
  assert.doesNotMatch(
    financeCreditSubmission,
    /Number\(credit\?\.amount\)\s*===\s*Number\(payload\.amount\)/u
  )
  assert.match(financeAllocationEditor, /Form\.List name="allocations"/u)
  assert.match(
    financeAllocation,
    /const initializeAllocationForm = \(visible\) => \{[\s\S]*if \(!visible\) return[\s\S]*allocationForm\.resetFields\(\)[\s\S]*allocationForm\.setFieldsValue\(/u
  )
  assert.match(
    financeAllocationEditor,
    /afterOpenChange=\{initializeAllocationForm\}/u
  )
  assert.doesNotMatch(
    financeAllocation,
    /const openAllocation = \(\) => \{[^}]*allocationForm\.setFieldsValue/u
  )
  assert.doesNotMatch(
    financeAllocationEditor,
    /form=\{allocationForm\}[\s\S]{0,100}preserve=\{false\}/u
  )
  assert.match(financeAdjustments, /expected_version:/u)
  assert.match(financeAdjustments, /reverseFinancePayment/u)
  assert.match(financeCreditSubmission, /createFinanceCreditNote/u)
  assert.match(financeCreditSubmission, /reverseFinanceCreditNote/u)
  assert.match(read('../components/finance/FinancePaymentAdjustmentModals.jsx'), /保留原收付款及核销记录/u)
  assert.match(financePaymentsPage, /getFinancePaymentApprovalProcess/u)
  assert.match(financeCreation, /startFinancePaymentApprovalProcess/u)
  assert.match(financePaymentsPage, />\s*核对审批流\s*</u)
  for (const source of [
    financePaymentsPage,
    financeAllocationEditor,
    financeDetails,
    read('../components/finance/FinancePaymentEditor.jsx'),
    read('../components/finance/FinanceCreditEditor.jsx'),
  ]) {
    assert.doesNotMatch(source, /客户ID|供应商ID|财务记录ID/u)
  }
})

test('production exception: requester can reconcile a submitted source whose process start was not confirmed', () => {
  assert.match(
    productionExceptionPanel,
    /getProductionExceptionApprovalProcess/u
  )
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
