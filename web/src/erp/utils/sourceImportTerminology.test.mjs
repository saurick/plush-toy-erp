import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
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
  resolve(__dirname, '../../../scripts/style-l1/businessListAssertions.mjs'),
  'utf8'
)
const businessFormInteractionScenarios = readFileSync(
  resolve(
    __dirname,
    '../../../scripts/style-l1/businessFormInteractionScenarios.mjs'
  ),
  'utf8'
)

test('主数据选择器使用具体档案名称，不冒充来源单据', () => {
  assert.doesNotMatch(salesOrderForm, /从业务来源导入/u)
  assert.doesNotMatch(purchaseOrderForm, /从业务来源导入/u)
  assert.match(salesOrderForm, /已有规格（选填）/u)
  assert.match(purchaseOrderForm, /这里只选择材料档案/u)
  assert.doesNotMatch(salesOrderForm, /从已有规格添加/u)
  assert.match(purchaseOrderForm, /从材料库添加/u)
  assert.match(purchaseOrderForm, /添加到采购明细/u)
  assert.doesNotMatch(salesOrderForm, /从 SKU 库导入|可导入 SKU/u)
  assert.doesNotMatch(purchaseOrderForm, /从材料库导入|可导入材料/u)
})

test('来源选择器空态与浏览器验证使用具体档案名', () => {
  assert.match(sourceImportPicker, /未选择\{selectedNoun\}/u)
  assert.match(styleL1, /未选择\$\{selectedNoun\}/u)
  assert.match(businessFormInteractionScenarios, /selectedNoun: '材料'/u)
})

test('候选选择和 Excel 文件导入的真实消费者均在统一核对范围内', () => {
  const root = resolve(__dirname, '../..')
  const components = new Map()
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.jsx')) components.set(relative(root, path), readFileSync(path, 'utf8'))
    }
  }
  walk(root)
  const consumers = (pattern) => [...components].filter(([, text]) => pattern.test(text)).map(([path]) => path).sort()
  const message = '新增导入入口须同时纳入业务范围、全选、数量提示与浏览器核对，不能只验证共享组件'
  assert.deepEqual(consumers(/<SourceImportPickerModal\b/u), [
    'dev-workbench/components/DevUIBusinessExamples.jsx',
    'erp/components/RemoteReferencePicker.jsx',
    'erp/components/sales-orders/SalesOrderExcelImport.jsx',
    'erp/components/shipments/ShipmentEditor.jsx',
  ], message)
  assert.deepEqual(consumers(/<RemoteReferencePicker\b/u), ['erp/components/purchase-orders/PurchaseOrderForm.jsx'], message)
  assert.deepEqual(consumers(/<BOMExcelImportPreview\b/u), [
    'erp/components/bom/BOMEditor.jsx',
    'erp/pages/BOMVersionsPage.jsx',
  ], message)
  assert.deepEqual(consumers(/type="file"/u).filter((path) => /accept=["'][^"']*\.(?:xlsx|xls|csv|tsv)/u.test(components.get(path))), [
    'erp/components/bom/BOMEditor.jsx',
    'erp/components/sales-orders/SalesOrderExcelImport.jsx',
    'erp/pages/BOMVersionsPage.jsx',
  ], message)
})
