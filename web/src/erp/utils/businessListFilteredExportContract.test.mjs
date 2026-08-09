import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

const formalBusinessListCases = [
  {
    title: '主数据',
    path: '../pages/V1MasterDataPage.jsx',
    completeList: /config\.listAll\(recordListParams,\s*\{ signal \}\)/u,
  },
  {
    title: '销售订单',
    path: '../pages/V1SalesOrdersPage.jsx',
    completeList: /listAllSalesOrders\(orderListParams,\s*\{ signal \}\)/u,
  },
  {
    title: '采购订单',
    path: '../pages/V1PurchaseOrdersPage.jsx',
    completeList: /listAllPurchaseOrders\(orderListParams,\s*\{ signal \}\)/u,
  },
  {
    title: '采购入库',
    path: '../pages/V1PurchaseReceiptsPage.jsx',
    completeList:
      /listAllPurchaseReceipts\(receiptListParams,\s*\{\s*signal,\s*\}\)/u,
  },
  {
    title: '质量检验',
    path: '../pages/V1QualityInspectionsPage.jsx',
    completeList: /loadQualityInspectionList\(\{ signal, all: true \}\)/u,
  },
  {
    title: '库存台账',
    path: '../pages/V1InventoryLedgerPage.jsx',
    completeList: /loadInventoryList\(\{ signal, all: true \}\)/u,
  },
  {
    title: '物料清单',
    path: '../pages/BOMVersionsPage.jsx',
    completeList: /listAllBOMVersions\(bomListParams,\s*\{ signal \}\)/u,
  },
  {
    title: '出货单',
    path: '../pages/ShipmentsPage.jsx',
    completeList: /listAllShipments\(shipmentListParams,\s*\{ signal \}\)/u,
  },
  {
    title: '委外订单',
    path: '../pages/V1OutsourcingOrdersPage.jsx',
    completeList:
      /listAllOutsourcingOrders\(outsourcingListParams,\s*\{\s*signal,\s*\}\)/u,
  },
  {
    title: '业务记录',
    path: '../pages/OperationalFactsPage.jsx',
    completeList: /activeConfig\.listAll\(/u,
  },
  {
    title: '生产订单',
    path: '../pages/V1ProductionOrdersPage.jsx',
    completeList:
      /listAllProductionOrders\(productionOrderListParams,\s*\{\s*signal,\s*\}\)/u,
  },
]

for (const pageCase of formalBusinessListCases) {
  test(`${pageCase.title}: exports the complete filtered result in the active column order`, () => {
    const source = readSource(pageCase.path)

    assert.match(source, /useBusinessListExport\(\{/u)
    assert.match(source, pageCase.completeList)
    assert.match(source, /loading \|\| exporting/u)
    assert.ok(
      source.includes('BusinessListToolbarActions') ||
        source.includes('列顺序'),
      `${pageCase.path} must expose column ordering`
    )
    assert.ok(
      source.includes('columnOrderModal') ||
        source.includes('<ColumnOrderModal'),
      `${pageCase.path} must mount the column-order panel`
    )
    assert.doesNotMatch(source, /downloadBusinessListCSV/u)
  })
}

test('config-driven lists expose strict complete-pagination readers', () => {
  const masterDataConfig = readSource(
    '../components/master-data/masterDataPageConfig.mjs'
  )
  const operationalFactConfig = readSource(
    '../components/operational-facts/operationalFactPageConfig.mjs'
  )

  for (const listAllName of [
    'listAllCustomers',
    'listAllSuppliers',
    'listAllMaterials',
    'listAllProcesses',
    'listAllProducts',
    'listAllProductSKUs',
  ]) {
    assert.match(masterDataConfig, new RegExp(`listAll: ${listAllName}`, 'u'))
  }
  for (const listAllName of [
    'listAllProductionFacts',
    'listAllOutsourcingFacts',
    'listAllShipments',
    'listAllStockReservations',
    'listAllFinanceFacts',
  ]) {
    assert.match(
      operationalFactConfig,
      new RegExp(`listAll: ${listAllName}`, 'u')
    )
  }
})

test('finance keeps complete filtered export and production exceptions stay non-exportable', () => {
  const finance = readSource('../pages/FinancePaymentsPage.jsx')
  const workflowModule = readSource('../pages/WorkflowBusinessModulePage.jsx')
  const productionException = readSource(
    '../components/production-exceptions/ProductionExceptionDecisionPanel.jsx'
  )

  assert.match(finance, /listAllFinancePayments\(/u)
  assert.match(finance, /listAllFinanceCreditNotes\(/u)
  assert.match(workflowModule, /showExport=\{!isProductionExceptionPage\}/u)
  assert.match(productionException, /showExport=\{false\}/u)
})
