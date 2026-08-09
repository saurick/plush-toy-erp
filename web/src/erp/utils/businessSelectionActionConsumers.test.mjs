import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const pagesDirectory = resolve(currentDirectory, '../pages')
const purchasePanelPath = resolve(
  currentDirectory,
  '../components/purchase-orders/PurchaseOrderOperationPanel.jsx'
)
const productionExceptionPanelPath = resolve(
  currentDirectory,
  '../components/production-exceptions/ProductionExceptionDecisionPanel.jsx'
)

const FORMAL_SELECTION_PAGE_CONSUMERS = Object.freeze({
  'BOMVersionsPage.jsx': 'BOMVersionsPage.jsx',
  'FinancePaymentsPage.jsx': 'FinancePaymentsPage.jsx',
  'OperationalFactsPage.jsx': 'OperationalFactsPage.jsx',
  'ShipmentsPage.jsx': 'ShipmentsPage.jsx',
  'V1InventoryLedgerPage.jsx': 'V1InventoryLedgerPage.jsx',
  'V1MasterDataPage.jsx': 'V1MasterDataPage.jsx',
  'V1OutsourcingOrdersPage.jsx': 'V1OutsourcingOrdersPage.jsx',
  'V1ProductionOrdersPage.jsx': 'V1ProductionOrdersPage.jsx',
  'V1PurchaseOrdersPage.jsx': purchasePanelPath,
  'V1PurchaseReceiptsPage.jsx': 'V1PurchaseReceiptsPage.jsx',
  'V1QualityInspectionsPage.jsx': 'V1QualityInspectionsPage.jsx',
  'V1SalesOrdersPage.jsx': 'V1SalesOrdersPage.jsx',
  'WorkflowBusinessModulePage.jsx': 'WorkflowBusinessModulePage.jsx',
})

const FORMAL_SELECTION_STABLE_ACTION_EVIDENCE = Object.freeze({
  'BOMVersionsPage.jsx': /data-business-action-key="activate"/u,
  'FinancePaymentsPage.jsx': /data-business-action-key="payment-allocation"/u,
  'OperationalFactsPage.jsx':
    /data-business-action-key="operational-fact-post"/u,
  'ShipmentsPage.jsx': /data-business-action-key="shipment-ship"/u,
  'V1InventoryLedgerPage.jsx': /data-business-action-key="related-records"/u,
  'V1MasterDataPage.jsx': /\{canUpdate \? \([\s\S]*?\{canDisable \? \(/u,
  'V1OutsourcingOrdersPage.jsx': /actionStates=\{lifecycleActionStates\}/u,
  'V1ProductionOrdersPage.jsx': /data-business-action-key="release"/u,
  'V1PurchaseOrdersPage.jsx': /data-business-action-key="generate-inbound"/u,
  'V1PurchaseReceiptsPage.jsx': /data-business-action-key="post"/u,
  'V1QualityInspectionsPage.jsx': /data-business-action-key="submit"/u,
  'V1SalesOrdersPage.jsx': /actionStates=\{lifecycleActionStates\}/u,
  'WorkflowBusinessModulePage.jsx':
    /data-business-action-key="workflow-task-complete"/u,
})

function pageSource(fileName) {
  return readFileSync(resolve(pagesDirectory, fileName), 'utf8')
}

function consumerSource(consumerPath) {
  return readFileSync(
    consumerPath.startsWith('/')
      ? consumerPath
      : resolve(pagesDirectory, consumerPath),
    'utf8'
  )
}

test('正式业务选择页清单完整，新增消费者必须进入共享动作合同', () => {
  const discoveredPages = readdirSync(pagesDirectory)
    .filter((fileName) => fileName.endsWith('.jsx'))
    .filter((fileName) => pageSource(fileName).includes('rowSelection'))
    .filter(
      (fileName) => fileName !== 'ProcessingContractPrintWorkspacePage.jsx'
    )
    .sort()

  assert.deepEqual(
    discoveredPages,
    Object.keys(FORMAL_SELECTION_PAGE_CONSUMERS).sort(),
    '正式业务页新增或移除 rowSelection 后，必须同步评审共享当前操作合同'
  )
})

test('全部正式业务选择页复用稳定动作条、清空入口和禁用原因提示', () => {
  for (const [pageFile, consumerPath] of Object.entries(
    FORMAL_SELECTION_PAGE_CONSUMERS
  )) {
    const source = consumerSource(consumerPath)
    assert.match(
      source,
      /<SelectionActionBar/u,
      `${pageFile} 必须复用 SelectionActionBar`
    )
    assert.match(
      source,
      /<SelectionClearAction/u,
      `${pageFile} 必须保留稳定的清空选择入口`
    )
    assert.match(
      source,
      /<BusinessActionTooltip/u,
      `${pageFile} 必须为临时不可用动作提供统一原因`
    )
  }
})

test('全部正式业务选择页保留稳定动作键，不允许选择或记录状态决定动作节点是否渲染', () => {
  assert.deepEqual(
    Object.keys(FORMAL_SELECTION_STABLE_ACTION_EVIDENCE).sort(),
    Object.keys(FORMAL_SELECTION_PAGE_CONSUMERS).sort(),
    '新增正式选择页时必须登记稳定动作键证据'
  )

  for (const [pageFile, consumerPath] of Object.entries(
    FORMAL_SELECTION_PAGE_CONSUMERS
  )) {
    const source = consumerSource(consumerPath)
    assert.match(
      source,
      FORMAL_SELECTION_STABLE_ACTION_EVIDENCE[pageFile],
      `${pageFile} 必须保留稳定动作目录证据`
    )
    assert.doesNotMatch(
      source,
      /\{\s*(?:selected(?:Order|Row|Task|Record)?|singleSelectedOrder|activeSelectedRow|hasSelection)\s*&&\s*\(?\s*<(?:BusinessActionTooltip|BusinessLifecyclePrimaryAction|BusinessLifecycleMoreAction|Button|Dropdown|Popconfirm)/u,
      `${pageFile} 不得把动作入口直接写成选中后才渲染`
    )
    const actionBarStart = source.indexOf('<SelectionActionBar')
    const actionBarEnd = source.indexOf('</SelectionActionBar>', actionBarStart)
    assert.ok(actionBarStart >= 0 && actionBarEnd > actionBarStart)
    const actionBarSource = source.slice(actionBarStart, actionBarEnd)
    assert.doesNotMatch(
      actionBarSource,
      /\{\s*(?:\w+\s*&&\s*)?\(?\s*!?(?:selected(?:Order|Row|Task|Record)?|singleSelectedOrder|activeSelectedRow|hasSelection)\b[^{}]{0,180}\?\s*\(\s*<(?:BusinessActionTooltip|BusinessLifecyclePrimaryAction|BusinessLifecycleMoreAction|Button|Dropdown|Popconfirm)/u,
      `${pageFile} 不得按选中记录增删当前操作节点`
    )
    assert.doesNotMatch(
      actionBarSource,
      /\{\s*(?:\w+\s*&&\s*)?\(?[^{}]{0,160}(?:\.status|lifecycleStatus)[^{}]{0,120}\?\s*\(\s*<(?:BusinessActionTooltip|BusinessLifecyclePrimaryAction|BusinessLifecycleMoreAction|Button|Dropdown|Popconfirm)/u,
      `${pageFile} 不得按记录状态增删当前操作节点`
    )
  }
})

test('生产异常子面板也纳入稳定动作合同', () => {
  const source = readFileSync(productionExceptionPanelPath, 'utf8')
  assert.match(source, /<SelectionActionBar/u)
  assert.match(source, /<SelectionClearAction/u)
  for (const actionKey of [
    'production-exception-approval',
    'production-exception-decide',
    'production-exception-withdraw',
    'production-exception-execute',
    'production-exception-reverse',
    'production-exception-revoke-quota',
  ]) {
    assert.match(
      source,
      new RegExp(`data-business-action-key="${actionKey}"`, 'u')
    )
  }
})

test('采购订单页通过唯一操作面板消费共享动作合同', () => {
  const purchasePage = pageSource('V1PurchaseOrdersPage.jsx')
  const purchasePanel = readFileSync(purchasePanelPath, 'utf8')

  assert.match(purchasePage, /<PurchaseOrderOperationPanel/u)
  assert.equal(
    (purchasePage.match(/<PurchaseOrderOperationPanel/gu) || []).length,
    1,
    '采购订单页只应有一个当前操作面板真源'
  )
  assert.match(purchasePanel, /<BusinessLifecyclePrimaryAction/u)
  assert.match(purchasePanel, /<BusinessLifecycleMoreAction/u)
})
