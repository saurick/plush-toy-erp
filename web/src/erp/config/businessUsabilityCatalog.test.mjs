import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { businessModuleDefinitions } from './businessModules.mjs'
import {
  BUSINESS_HELP_TYPES,
  BUSINESS_USABILITY_CATALOG,
  BUSINESS_USABILITY_STATUS,
  getBusinessHelpItem,
  getBusinessUsabilityTargetPageKeys,
} from './businessUsabilityCatalog.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const read = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), 'utf8')

const targetPageSources = Object.freeze({
  'sales-orders': 'web/src/erp/pages/V1SalesOrdersPage.jsx',
  'material-bom': 'web/src/erp/pages/BOMVersionsPage.jsx',
  'accessories-purchase': 'web/src/erp/pages/V1PurchaseOrdersPage.jsx',
  inbound: 'web/src/erp/pages/V1PurchaseReceiptsPage.jsx',
  'quality-inspections': 'web/src/erp/pages/V1QualityInspectionsPage.jsx',
  inventory: 'web/src/erp/pages/V1InventoryLedgerPage.jsx',
  'processing-contracts': 'web/src/erp/pages/V1OutsourcingOrdersPage.jsx',
  'production-orders': 'web/src/erp/pages/V1ProductionOrdersPage.jsx',
  shipments: 'web/src/erp/pages/ShipmentsPage.jsx',
  'finance-payments': 'web/src/erp/pages/FinancePaymentsPage.jsx',
})

test('businessUsabilityCatalog: 从正式页面目录派生并完整覆盖十个高频页面', () => {
  assert.deepEqual(
    BUSINESS_USABILITY_CATALOG.map((entry) => entry.key),
    businessModuleDefinitions.map((entry) => entry.key)
  )
  assert.deepEqual(Object.keys(BUSINESS_USABILITY_STATUS).toSorted(), [
    'COVERED',
    'MISSING',
    'PARTIAL',
  ])

  const targetKeys = getBusinessUsabilityTargetPageKeys()
  assert.equal(targetKeys.length, 10)
  assert.equal(new Set(targetKeys).size, targetKeys.length)
  assert.deepEqual(
    targetKeys.toSorted(),
    Object.keys(targetPageSources).toSorted()
  )

  targetKeys.forEach((key) => {
    const entry = BUSINESS_USABILITY_CATALOG.find((item) => item.key === key)
    assert(entry, key)
    assert.equal(entry.status, BUSINESS_USABILITY_STATUS.COVERED, key)
    assert.equal(entry.hasPageHelp, true, key)
    assert(entry.completion, key)
    assert(entry.handoff, key)
    assert(entry.flowSteps.length >= 3, key)
    assert(
      entry.requiredHelpTypes.every((type) =>
        entry.helpTypeKeys.includes(type)
      ),
      key
    )
  })
})

test('businessUsabilityCatalog: 公式说明带来源和例子且金额统一使用当前币种口径', () => {
  BUSINESS_USABILITY_CATALOG.flatMap((entry) => entry.items)
    .filter((item) => item.type === BUSINESS_HELP_TYPES.FORMULA)
    .forEach((item) => {
      assert(item.source, item.key)
      assert(item.example, item.key)
    })

  const purchaseAmount = getBusinessHelpItem(
    'accessories-purchase',
    'purchase-line-amount'
  )
  assert.match(purchaseAmount.explanation, /采购数量 × 单价/u)
  assert.match(purchaseAmount.explanation, /不允许/u)
  assert.doesNotMatch(purchaseAmount.explanation, /确认金额/u)
  ;[
    ['sales-orders', 'line-amount'],
    ['accessories-purchase', 'purchase-line-amount'],
    ['processing-contracts', 'outsourcing-line-amount'],
    ['finance-payments', 'allocation-amount'],
  ].forEach(([pageKey, itemKey]) => {
    const amountHelp = getBusinessHelpItem(pageKey, itemKey)
    assert.match(amountHelp.example, /当前币种/u, `${pageKey}:${itemKey}`)
    assert.doesNotMatch(amountHelp.example, /元/u, `${pageKey}:${itemKey}`)
  })
})

test('businessUsabilityCatalog: 十个业务页接入同一页内帮助触发器', () => {
  Object.entries(targetPageSources).forEach(([key, sourcePath]) => {
    assert.match(read(sourcePath), new RegExp(`helpKey=["']${key}["']`, 'u'))
  })

  const layoutSource = read(
    'web/src/erp/components/business-list/BusinessListLayout.jsx'
  )
  assert.match(layoutSource, /BusinessPageHelpTrigger/u)
  assert.match(layoutSource, /helpKey = ''/u)
  assert.match(layoutSource, /pageKey=\{helpKey\}/u)
})

test('businessUsabilityCatalog: 关键字段问号可悬停、聚焦和点击且移动弹窗可滚动并恢复焦点', () => {
  const componentSource = read(
    'web/src/erp/components/help/BusinessContextHelp.jsx'
  )
  assert.match(componentSource, /trigger=\{\['hover', 'focus', 'click'\]\}/u)
  assert.match(componentSource, /aria-label=\{`查看\$\{label\}说明`\}/u)
  assert.match(componentSource, /focusTriggerAfterClose/u)
  assert.match(componentSource, /keyboard/u)
  assert.match(componentSource, /maxWidth: 'calc\(100vw - 24px\)'/u)
  assert.match(componentSource, /maxHeight: 'min\(70vh, 680px\)'/u)
  assert.match(componentSource, /overflowY: 'auto'/u)
  assert.match(componentSource, /overscrollBehavior: 'contain'/u)

  const inlineSources = [
    ['web/src/erp/components/sales-orders/SalesOrderForm.jsx', 'line-amount'],
    [
      'web/src/erp/components/purchase-orders/PurchaseOrderForm.jsx',
      'purchase-line-amount',
    ],
    ['web/src/erp/components/bom/BOMVersionForms.jsx', 'loss-rate'],
    [
      'web/src/erp/components/quality-inspections/QualityInspectionForms.jsx',
      'defect-rate',
    ],
    ['web/src/erp/pages/V1InventoryLedgerPage.jsx', 'available-quantity'],
    [
      'web/src/erp/components/outsourcing-orders/OutsourcingOrderForm.jsx',
      'outsourcing-line-amount',
    ],
    ['web/src/erp/pages/FinancePaymentsPage.jsx', 'allocation-amount'],
  ]
  inlineSources.forEach(([sourcePath, itemKey]) => {
    const source = read(sourcePath)
    assert.match(source, /BusinessHelpLabel/u)
    assert.match(source, new RegExp(`itemKey=["']${itemKey}["']`, 'u'))
  })

  assert.doesNotMatch(componentSource, /\/__dev/u)
})
