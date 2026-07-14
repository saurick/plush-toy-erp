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
