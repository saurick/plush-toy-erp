import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'
import { buildCSVText } from './csvExport.mjs'
import { formatUnixDate, formatUnixDateTime } from './masterDataOrderView.mjs'
import { referenceLabel } from './referenceSelectOptions.mjs'

registerJSXTestLoader()

const modules = {}
before(async () => {
  for (const [key, source] of Object.entries({
    purchase: 'purchase-orders/purchaseOrderColumns.jsx',
    sales: 'sales-orders/salesOrderColumns.jsx',
    outsourcing: 'outsourcing-orders/outsourcingOrderColumns.jsx',
    shipment: 'shipments/shipmentColumns.jsx',
    master: 'master-data/masterDataColumns.jsx',
    bom: 'bom/BOMVersionColumns.jsx',
    inventory: 'inventory/inventoryLedgerPresentation.jsx',
    quality: 'quality-inspections/qualityInspectionColumns.jsx',
    facts: 'operational-facts/operationalFactPageConfig.mjs',
    finance: 'finance/useFinancePaymentColumns.jsx',
    financePresentation: 'finance/financePaymentPresentation.jsx',
  })) {
    modules[key] = await import(`../components/${source}`)
  }
})

const resolver = (record) => record?.supplier_snapshot?.name || (record?.supplier_id ? '供应商已关联' : '-')
const columnValue = (columns, key, row = {}) => {
  const column = columns.find((item) => (item.dataIndex || item.key || item.exportTitle || item.title) === key)
  assert.ok(column, `missing export column: ${key}`)
  return column.exportValue ? column.exportValue(row) : row[column.dataIndex]
}
const inventoryColumns = (activeView) => modules.inventory.createInventoryLedgerColumns({
  activeView,
  renderSubjectReference: (value) => referenceLabel([], value, '存货'),
  renderSubjectIdentity: () => null,
  renderProductSKUReference: (value, row) => row?.subject_type === 'PRODUCT' ? value ? '规格已关联' : '未分规格' : '-',
  renderLotReference: (value) => referenceLabel([], value, '批次'),
  renderUnitReference: (value) => referenceLabel([], value, '单位'),
  renderWarehouseReference: (value) => referenceLabel([], value, '仓库'),
})
const financeColumns = () => {
  let result
  function Probe() {
    result = modules.finance.default({ customers: [], suppliers: [] })
    return null
  }
  renderToStaticMarkup(React.createElement(Probe))
  return [...result.paymentColumns, ...result.creditColumns]
}
const cases = [
  ['采购订单', () => modules.purchase.buildPurchaseOrderColumns({ resolveSupplierName: resolver })],
  ['销售订单', () => modules.sales.buildSalesOrderColumns()],
  ['销售明细', () => modules.sales.buildSalesOrderItemColumns()],
  ['委外订单', () => modules.outsourcing.buildOutsourcingOrderColumns({ resolveSupplierName: resolver })],
  ['出货', () => modules.shipment.buildShipmentColumns({ salesOrdersByID: new Map() })],
  ['BOM', () => modules.bom.buildBOMVersionColumns({})],
  ['质检明细', () => modules.quality.buildQualityInspectionExportColumns({})],
  ['质检列表', () => modules.quality.buildQualityInspectionDataColumns({})],
  ['收付款及红冲', financeColumns],
  ...['products', 'product_skus', 'materials', 'customers', 'suppliers', 'processes'].map((type) => [
    `主数据 ${type}`,
    () => modules.master.buildMasterDataRecordColumns({ type, productOptions: [], unitDisplay: (id) => referenceLabel([], id, '单位') }),
  ]),
  ...['lots', 'txns', 'balances'].map((view) => [`库存 ${view}`, () => inventoryColumns(view)]),
  ...['production', 'outsourcing', 'shipments', 'reservations', 'finance'].map((view) => [
    `业务记录 ${view}`, () => modules.facts.buildOperationalFactColumns(view),
  ]),
]

for (const [name, getColumns] of cases) {
  test(`${name}: empty exports do not contain presentation placeholders`, () => {
    const columns = getColumns()
    assert.ok(columns.length > 0)
    const placeholders = new Set(['-', '—', '未填写', '未记录', '历史未记录', '未填日期', '未填写产品名称'])
    for (const column of columns.filter((item) => item.exportValue)) {
      const value = column.exportValue({})
      assert.ok(!placeholders.has(value), `${name} ${column.exportTitle || column.title}: ${value}`)
      assert.doesNotMatch(String(value ?? ''), /(?:^|\s)[—-](?:\s|$)/u)
    }
  })
}

test('purchase dates and terms export blanks without changing page placeholders or valid zero-day terms', () => {
  const columns = modules.purchase.buildPurchaseOrderColumns({ resolveSupplierName: resolver })
  for (const value of [undefined, null, '', 0]) {
    for (const key of ['purchase_date', 'expected_arrival_date', 'supplier_confirmed_arrival_date']) {
      assert.equal(columnValue(columns, key, { [key]: value }), '')
    }
    assert.equal(formatUnixDate(value), '-')
    assert.equal(formatUnixDateTime(value), '-')
  }
  assert.equal(columnValue(columns, 'payment_condition', { payment_method: '月结', payment_term_days: 0 }), '月结 0天')
  assert.equal(columnValue(columns, 'invoice_preference', { invoice_required: false }), '不需要发票')
  assert.equal(columnValue(columns, 'invoice_preference', { invoice_required: true }), '需要发票（类别未填写）')
  assert.equal(columnValue(columns, 'payment_condition', { payment_method: '-' }), '-')
  assert.equal(columnValue(columns, 'supplier_id', { supplier_snapshot: { name: '-' } }), '-')
  const date = 1792713600
  assert.equal(columnValue(columns, 'expected_arrival_date', { expected_arrival_date: date }), formatUnixDate(date))
})

test('sales and shipment compound cells omit missing parts and preserve real text', () => {
  const sales = modules.sales.buildSalesOrderColumns()
  assert.equal(columnValue(sales, 'contact_snapshot', { contact_snapshot: { phone: '123-456' } }), '123-456')
  assert.equal(columnValue(sales, 'delivery_snapshot', { delivery_snapshot: { address: '-' } }), '-')
  assert.equal(columnValue(sales, 'tax_terms', { tax_rate: 0 }), '0%')
  const shipment = modules.shipment.buildShipmentColumns({ salesOrdersByID: new Map() })
  const dates = shipment.find((column) => column.exportValue && column.title === '出货日期')
  assert.ok(dates)
  assert.equal(dates.exportValue({}), '')
  assert.equal(dates.exportValue({ planned_ship_at: 1792713600 }), `计划 ${formatUnixDate(1792713600)}`)
  assert.equal(dates.exportValue({ shipped_at: 1792713600 }), `实际 ${formatUnixDate(1792713600)}`)
  assert.equal(columnValue(shipment, 'package_summary', { package_count: 0, gross_weight_kg: 0, volume_m3: 0 }), '0 件 / 箱 毛重 0 千克 体积 0 立方米')
})

test('master-data boolean exports distinguish missing values from true and false', () => {
  const columns = modules.master.buildMasterDataRecordColumns({ type: 'processes' })
  for (const key of ['is_active', 'outsourcing_enabled', 'inhouse_enabled', 'quality_required']) {
    assert.equal(columnValue(columns, key), '')
    assert.equal(columnValue(columns, key, { [key]: false }), key === 'is_active' ? '停用' : '否')
    assert.equal(columnValue(columns, key, { [key]: true }), key === 'is_active' ? '启用' : '是')
  }
})

test('finance and inventory distinguish missing amounts from zero and negative values', () => {
  const facts = modules.facts.buildOperationalFactColumns('finance')
  const inventory = inventoryColumns('balances')
  for (const value of [null, undefined, '']) {
    assert.equal(columnValue(facts, 'amount', { amount: value }), '')
    assert.equal(columnValue(inventory, 'quantity', { quantity: value }), '')
  }
  for (const value of [0, '0', -12.5, '-12.5']) {
    assert.equal(columnValue(facts, 'amount', { amount: value }), value)
    assert.equal(columnValue(inventory, 'quantity', { quantity: value }), value)
  }
  const allocation = modules.financePresentation.paymentAllocationExportValue({ allocations: [{ finance_fact_no: 'F-1', amount: 0, currency: 'CNY' }] })
  assert.equal(allocation, 'F-1 / 0 CNY / 已过账')
  assert.equal(columnValue(inventory, 'product_sku_id', { subject_type: 'PRODUCT' }), '未分规格')
})

test('quality exports skip absent compound parts while preserving zero and warnings for incomplete data', () => {
  const columns = modules.quality.buildQualityInspectionExportColumns({})
  const stage = { inspection_type: 'PRODUCTION_STAGE', source_type: 'PRODUCTION_WIP', product_name: '测试产品', production_order_no: 'MO-1', batch_quantity: 0 }
  assert.equal(columnValue(columns, 'subject_type', stage), '测试产品')
  assert.equal(columnValue(columns, 'warehouse_id', stage), '')
  assert.equal(columnValue(columns, 'inventory_lot_id', stage), '')
  assert.doesNotMatch(columnValue(columns, 'inspection_type', stage), /—|生产工序：|质量关口：/u)
  assert.equal(columnValue(columns, 'defect_rate_percent', { defect_rate_operator: 'APPROX', defect_rate_percent: 0 }), '0%')
  assert.equal(columnValue(columns, 'defect_rate_percent', { defect_rate_percent: '20' }), '比例待核对')
  assert.equal(columnValue(columns, 'decision_note', { decision_note: '-' }), '-')
})

test('CSV output keeps the header and column positions when all optional purchase fields are blank', () => {
  const columns = modules.purchase.buildPurchaseOrderColumns({ resolveSupplierName: resolver })
  const keys = ['purchase_order_no', 'expected_arrival_date', 'supplier_confirmed_arrival_date', 'payment_condition', 'invoice_preference', 'delivery_address']
  const row = { purchase_order_no: 'PO-EMPTY', invoice_required: false }
  const values = keys.map((key) => columnValue(columns, key, row))
  assert.equal(buildCSVText([keys, values]).split('\n')[1], 'PO-EMPTY,,,,不需要发票,')
})
