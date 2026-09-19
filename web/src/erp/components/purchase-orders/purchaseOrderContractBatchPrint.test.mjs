import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(
  new URL('../../pages/V1PurchaseOrdersPage.jsx', import.meta.url),
  'utf8'
)
const operationPanel = readFileSync(
  new URL('./PurchaseOrderOperationPanel.jsx', import.meta.url),
  'utf8'
)
const printHook = readFileSync(
  new URL('./usePurchaseOrderContractPrint.mjs', import.meta.url),
  'utf8'
)
const batchWorkbench = readFileSync(
  new URL(
    '../print/MaterialPurchaseContractBatchWorkbench.jsx',
    import.meta.url
  ),
  'utf8'
)
const printStyles = readFileSync(
  new URL('../../styles/app/print-responsive.css', import.meta.url),
  'utf8'
)

test('采购订单多选完整进入批量窗口，缺值留在窗口补齐', () => {
  assert.match(
    page,
    /const \{ printPurchaseContract, printPurchaseContracts, printingContract \} =/u
  )
  assert.match(page, /printPurchaseContracts=\{printPurchaseContracts\}/u)
  assert.match(page, /selectedOrders=\{selectedOrders\}/u)
  assert.match(page, /rowSelection=\{\{[\s\S]*type: 'checkbox'/u)
  assert.doesNotMatch(operationPanel, /printSelectionWithinLimit|选择本页前/u)
  assert.match(
    operationPanel,
    /selectionActionPriority=\{printSelectionCount > 1 \? 120 : 40\}/u
  )
  assert.match(
    operationPanel,
    /printSelectionCount === 1[\s\S]*printPurchaseContract\(selectedPrintOrders\[0\]\)[\s\S]*printPurchaseContracts\(selectedPrintOrders\)/u
  )
  assert.match(operationPanel, /'批量打印合同'/u)
  assert.doesNotMatch(printHook, /getMaterialPurchaseContractBatchProblems/u)
  assert.match(printHook, /getPurchaseOrder\(\{ id: source.id \}, options\)/u)
})

test('批量工作台逐合同渲染并在打印时独立分页', () => {
  assert.match(
    batchWorkbench,
    /currentContracts\.map\([\s\S]*erp-material-contract-batch__document[\s\S]*MaterialPurchaseContractPaper/u
  )
  assert.match(
    batchWorkbench,
    /handleFieldCommit=[\s\S]*updateMaterialPurchaseField/u
  )
  assert.match(
    printStyles,
    /\.erp-material-contract-batch__document[\s\S]*\+ \.erp-material-contract-batch__document[\s\S]*break-before: page/u
  )
})
