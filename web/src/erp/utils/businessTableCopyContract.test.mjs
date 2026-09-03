import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const sourceRoot = resolve(currentDirectory, '..')

function readSource(relativePath) {
  return readFileSync(resolve(sourceRoot, relativePath), 'utf8')
}

function assertCopyableMarker(relativePath, marker, sectionMarker = '') {
  const source = readSource(relativePath)
  const sectionIndex = sectionMarker ? source.indexOf(sectionMarker) : 0
  assert.notEqual(
    sectionIndex,
    -1,
    `${relativePath} must keep section ${sectionMarker}`
  )
  const markerIndex = source.indexOf(marker, sectionIndex)
  assert.notEqual(markerIndex, -1, `${relativePath} must keep ${marker}`)
  assert.match(
    source.slice(markerIndex, markerIndex + 520),
    /\bcopyable\s*:/u,
    `${relativePath} ${marker} must stay in the copy whitelist`
  )
}

test('BusinessDataTable only decorates explicitly copyable columns', () => {
  const source = readSource('components/business-list/BusinessListLayout.jsx')
  const componentStart = source.indexOf('function CopyableBusinessTableCell')
  const componentEnd = source.indexOf('function resolveBusinessTableScrollX')
  const componentSource = source.slice(componentStart, componentEnd)

  assert.notEqual(componentStart, -1)
  assert.notEqual(componentEnd, -1)
  assert.match(componentSource, /if \(nextColumn\.copyable\)/u)
  assert.match(componentSource, /event\.stopPropagation\(\)/u)
  assert.match(componentSource, /event\.detail > 0/u)
  assert.match(componentSource, /trigger\.blur\(\)/u)
  assert.match(componentSource, /aria-label=\{`复制\$\{copyLabel\}`\}/u)
  assert.match(
    componentSource,
    /onDoubleClick=\{\(event\) => event\.stopPropagation\(\)\}/u
  )
})

test('formal business main tables register useful text columns explicitly', () => {
  const expectations = [
    ['components/master-data/masterDataColumns.jsx', "dataIndex: 'code'"],
    [
      'components/sales-orders/salesOrderColumns.jsx',
      "dataIndex: 'order_no'",
      'export function buildSalesOrderColumns',
    ],
    [
      'components/purchase-orders/purchaseOrderColumns.jsx',
      "dataIndex: 'purchase_order_no'",
    ],
    [
      'components/quality-inspections/qualityInspectionColumns.jsx',
      "dataIndex: 'inspection_no'",
      'export function buildQualityInspectionDataColumns',
    ],
    ['components/bom/BOMVersionColumns.jsx', "dataIndex: 'version'"],
    [
      'components/outsourcing-orders/outsourcingOrderColumns.jsx',
      "dataIndex: 'outsourcing_order_no'",
    ],
    ['components/shipments/shipmentColumns.jsx', "dataIndex: 'shipment_no'"],
    [
      'components/operational-facts/operationalFactPageConfig.mjs',
      "copyable: { label: '单号' }",
    ],
    ['pages/V1PurchaseReceiptsPage.jsx', "dataIndex: 'receipt_no'"],
    ['pages/FinancePaymentsPage.jsx', "dataIndex: 'payment_no'"],
    ['pages/WorkflowBusinessModulePage.jsx', "dataIndex: 'task_code'"],
    ['pages/V1ProductionOrdersPage.jsx', "dataIndex: 'order_no'"],
    ['pages/HistoryRecordsPage.jsx', "dataIndex: 'primary'"],
    ['pages/V1InventoryLedgerPage.jsx', "dataIndex: 'lot_no'"],
  ]

  expectations.forEach(([relativePath, marker, sectionMarker]) =>
    assertCopyableMarker(relativePath, marker, sectionMarker)
  )
})

test('sales order contact rendering does not consume the table record as fallback text', () => {
  const source = readSource(
    'components/sales-orders/salesOrderColumns.jsx'
  )

  assert.match(source, /render:\s*\(value\)\s*=>\s*contactText\(value\)/u)
  assert.doesNotMatch(source, /render:\s*contactText\s*,/u)
})

test('copy whitelist avoids routine dates, amounts, quantities and statuses', () => {
  const sources = [
    'components/sales-orders/salesOrderColumns.jsx',
    'components/purchase-orders/purchaseOrderColumns.jsx',
    'components/quality-inspections/qualityInspectionColumns.jsx',
    'components/shipments/shipmentColumns.jsx',
    'pages/V1InventoryLedgerPage.jsx',
  ].map(readSource)
  const forbiddenFields = [
    'amount',
    'goods_amount',
    'lifecycle_status',
    'planned_delivery_date',
    'quantity',
    'status',
  ]

  for (const source of sources) {
    for (const field of forbiddenFields) {
      const marker = `dataIndex: '${field}'`
      let searchFrom = 0
      while (source.indexOf(marker, searchFrom) >= 0) {
        const markerIndex = source.indexOf(marker, searchFrom)
        const lineStart = source.lastIndexOf('\n', markerIndex) + 1
        const indent =
          source.slice(lineStart, markerIndex).match(/^\s*/u)?.[0] || ''
        const closingToken = `\n${indent.slice(0, -2)}},`
        const lineEnd = source.indexOf('\n', markerIndex)
        const sameLineEnd = source.slice(markerIndex, lineEnd).indexOf('},')
        const nextColumnIndex =
          sameLineEnd >= 0
            ? markerIndex + sameLineEnd
            : source.indexOf(closingToken, markerIndex)
        const columnTail = source.slice(markerIndex, nextColumnIndex)
        assert.doesNotMatch(
          columnTail,
          /\bcopyable\s*:/u,
          `${marker} must not gain a copy action`
        )
        searchFrom = markerIndex + marker.length
      }
    }
  }
})
