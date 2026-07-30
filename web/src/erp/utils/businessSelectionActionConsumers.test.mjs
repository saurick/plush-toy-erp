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

const FORMAL_SELECTION_PAGE_CONSUMERS = Object.freeze({
  'BOMVersionsPage.jsx': 'BOMVersionsPage.jsx',
  'FinancePaymentsPage.jsx': 'FinancePaymentsPage.jsx',
  'OperationalFactsPage.jsx': 'OperationalFactsPage.jsx',
  'SalesReturnsPage.jsx': 'SalesReturnsPage.jsx',
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

const FORMAL_SELECTION_DISCOVERABILITY_EVIDENCE = Object.freeze({
  'BOMVersionsPage.jsx':
    /selectedRowKeys\.length !== 1|selectedRowKeys\.length === 0/u,
  'FinancePaymentsPage.jsx': /resolveFinancePaymentActionAvailability/u,
  'OperationalFactsPage.jsx': /!activeSelectedRow/u,
  'SalesReturnsPage.jsx': /resolveSalesReturnActionAvailability/u,
  'ShipmentsPage.jsx': /resolveShipmentActionAvailability/u,
  'V1InventoryLedgerPage.jsx': /resolveRelatedRecordActionAvailability/u,
  'V1MasterDataPage.jsx': /disabled=\{!selectedRecord \|\| saving\}/u,
  'V1OutsourcingOrdersPage.jsx':
    /!selectedRow \|\| canEditOutsourcingOrder\(selectedRow\)/u,
  'V1ProductionOrdersPage.jsx': /!selected \|\| selected\.status/u,
  'V1PurchaseOrdersPage.jsx':
    /!singleSelectedOrder \|\| selectedLifecycleStatus/u,
  'V1PurchaseReceiptsPage.jsx': /!selectedRow \|\|/u,
  'V1QualityInspectionsPage.jsx': /!selectedRow \|\|/u,
  'V1SalesOrdersPage.jsx': /!selectedOrder \|\| selectedOrderLifecycleStatus/u,
  'WorkflowBusinessModulePage.jsx': /!selectedTask \|\|/u,
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
    .filter((fileName) => fileName !== 'ProcessingContractPrintWorkspacePage.jsx')
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

test('全部正式业务选择页保留未选中发现性，不允许把记录动作直接绑成选中后才渲染', () => {
  assert.deepEqual(
    Object.keys(FORMAL_SELECTION_DISCOVERABILITY_EVIDENCE).sort(),
    Object.keys(FORMAL_SELECTION_PAGE_CONSUMERS).sort(),
    '新增正式选择页时必须登记未选中动作发现性证据'
  )

  for (const [pageFile, consumerPath] of Object.entries(
    FORMAL_SELECTION_PAGE_CONSUMERS
  )) {
    const source = consumerSource(consumerPath)
    assert.match(
      source,
      FORMAL_SELECTION_DISCOVERABILITY_EVIDENCE[pageFile],
      `${pageFile} 必须保留“未选择也渲染、按钮置灰”的动作分支`
    )
    assert.doesNotMatch(
      source,
      /\{\s*(?:selected(?:Order|Row|Task|Record)?|singleSelectedOrder|activeSelectedRow|hasSelection)\s*&&\s*\(?\s*<(?:BusinessActionTooltip|BusinessLifecyclePrimaryAction|BusinessLifecycleMoreAction|Button|Dropdown|Popconfirm)/u,
      `${pageFile} 不得把动作入口直接写成选中后才渲染`
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
