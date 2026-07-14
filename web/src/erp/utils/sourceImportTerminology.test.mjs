import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const salesOrderForm = readFileSync(
  resolve(__dirname, '../components/sales-orders/SalesOrderForm.jsx'),
  'utf8'
)
const purchaseOrderForm = readFileSync(
  resolve(__dirname, '../components/purchase-orders/PurchaseOrderForm.jsx'),
  'utf8'
)
const sourceImportPicker = readFileSync(
  resolve(__dirname, '../components/business-list/SourceImportPickerModal.jsx'),
  'utf8'
)
const styleL1 = readFileSync(
  resolve(__dirname, '../../../scripts/styleL1.mjs'),
  'utf8'
)
const businessFormalScenarios = readFileSync(
  resolve(__dirname, '../../../scripts/style-l1/businessFormalScenarios.mjs'),
  'utf8'
)
const styleL1Scenarios = readFileSync(
  resolve(__dirname, '../../../scripts/style-l1/scenarios.mjs'),
  'utf8'
)

test('主数据选择器使用具体档案名称，不冒充来源单据', () => {
  assert.doesNotMatch(salesOrderForm, /从业务来源导入/u)
  assert.doesNotMatch(purchaseOrderForm, /从业务来源导入/u)
  assert.match(salesOrderForm, /这里只选择 SKU 档案/u)
  assert.match(purchaseOrderForm, /这里只选择材料档案/u)
  assert.match(salesOrderForm, /从 SKU 库添加/u)
  assert.match(salesOrderForm, /添加到订单行/u)
  assert.match(purchaseOrderForm, /从材料库添加/u)
  assert.match(purchaseOrderForm, /添加到采购明细/u)
  assert.doesNotMatch(salesOrderForm, /从 SKU 库导入|可导入 SKU/u)
  assert.doesNotMatch(purchaseOrderForm, /从材料库导入|可导入材料/u)
})

test('来源选择器空态与浏览器验证使用具体档案名', () => {
  assert.match(sourceImportPicker, /未选择\{selectedNoun\}/u)
  assert.match(styleL1, /未选择\$\{selectedNoun\}/u)
  assert.match(businessFormalScenarios, /selectedNoun: 'SKU'/u)
  assert.match(styleL1Scenarios, /selectedNoun: '材料'/u)
})
