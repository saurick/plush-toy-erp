import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const erpRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function source(relativePath) {
  return readFileSync(path.join(erpRoot, relativePath), 'utf8')
}

const aggregatePages = [
  'pages/V1SalesOrdersPage.jsx',
  'pages/V1PurchaseOrdersPage.jsx',
  'pages/V1OutsourcingOrdersPage.jsx',
  'pages/V1PurchaseReceiptsPage.jsx',
  'pages/ShipmentsPage.jsx',
  'pages/V1ProductionOrdersPage.jsx',
  'pages/BOMVersionsPage.jsx',
]

test('seven document aggregate pages use the shared row item preview contract', () => {
  for (const relativePath of aggregatePages) {
    const pageSource = source(relativePath)
    assert.match(
      pageSource,
      /useBusinessRowItemsPreview/,
      `${relativePath} should use the shared preview hook`
    )
    assert.match(
      pageSource,
      /expandable=\{\w+ItemsPreview\.expandable\}/,
      `${relativePath} should pass the shared controlled expandable config`
    )
    assert.match(
      pageSource,
      /\{\w+ItemsPreview\.modal\}/,
      `${relativePath} should render the shared read-only all-items modal`
    )
  }
})

test('shared preview owns single-row disclosure, event isolation and read-only modal layers', () => {
  const componentSource = source(
    'components/business-list/BusinessRowItemsPreview.jsx'
  )
  assert.match(componentSource, /columnTitle:\s*'明细'/)
  assert.match(
    componentSource,
    /expandedRowKeys:\s*expandedRowKey === null \? \[\] : \[expandedRowKey\]/
  )
  assert.match(componentSource, /expandRowByClick:\s*false/)
  assert.match(componentSource, /event\.stopPropagation\(\)/)
  assert.match(componentSource, /aria-expanded=\{expanded\}/)
  assert.match(componentSource, /<RightOutlined\s*\/>/)
  assert.match(componentSource, /<DownOutlined\s*\/>/)
  assert.match(componentSource, /aria-label="明细快速预览"/)
  assert.match(componentSource, /aria-label="完整明细"/)
  assert.match(componentSource, />\s*查看全部\s*</)
  assert.doesNotMatch(componentSource, /onOk=/)
})

test('source-document previews stay permission-aware and separate first-page from full reads', () => {
  const salesSource = source('pages/V1SalesOrdersPage.jsx')
  assert.match(salesSource, /'sales_order\.read'/)
  assert.match(salesSource, /'sales_order_item\.read'/)
  assert.match(salesSource, /listSalesOrderItemsPreview/)
  assert.match(salesSource, /listAllSalesOrderItems/)

  for (const [relativePath, previewFunction, fullFunction] of [
    [
      'pages/V1PurchaseOrdersPage.jsx',
      'listPurchaseOrderItemsPreview',
      'listAllPurchaseOrderItems',
    ],
    [
      'pages/V1OutsourcingOrdersPage.jsx',
      'listOutsourcingOrderItemsPreview',
      'listAllOutsourcingOrderItems',
    ],
  ]) {
    const pageSource = source(relativePath)
    assert.match(pageSource, new RegExp(previewFunction))
    assert.match(pageSource, new RegExp(fullFunction))
  }
})

test('embedded and detail-backed aggregate pages keep their existing item truth sources', () => {
  for (const relativePath of [
    'pages/V1PurchaseReceiptsPage.jsx',
    'pages/ShipmentsPage.jsx',
  ]) {
    assert.match(
      source(relativePath),
      /getEmbeddedItems:\s*\(record\) => record\?\.items/
    )
  }

  assert.match(
    source('pages/V1ProductionOrdersPage.jsx'),
    /loadPreview:[\s\S]*?getProductionOrder\(record\.id/
  )
  const bomSource = source('pages/BOMVersionsPage.jsx')
  assert.match(
    bomSource,
    /loadPreview:[\s\S]*?getBOMVersion\(\{ id: record\.id \}\)/
  )
  assert.match(bomSource, /itemsPreviewGenerationRef\.current \+= 1/)
})
