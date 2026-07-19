import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ShipmentBusinessModal.jsx', import.meta.url),
  'utf8'
)

test('shipment sales-order import is separately permission gated', () => {
  assert.match(source, /canImportSalesOrderSource = false/u)
  assert.match(source, /disabled=\{!canImportSalesOrderSource\}/u)
  assert.match(source, /onClick=\{onOpenSalesOrderImport\}/u)
})

test('shipment source references can only be established by candidate import', () => {
  assert.match(source, /sourceSelectionOnly=\{isCreateModal\}/u)
  assert.match(
    source,
    /label="销售订单"[\s\S]*?<Select[\s\S]*?disabled=\{disabled \|\| sourceSelectionOnly\}/u
  )
  assert.match(
    source,
    /label="出货单号（自动）"[\s\S]*?<Input[\s\S]*?disabled=\{disabled\}/u
  )
  assert.match(
    source,
    /sourceSelectionDisabled=\{Boolean\(selectedSalesOrder\)\}/u
  )
  assert.match(source, /disabled=\{sourceSelectionDisabled\}/u)
  assert.match(source, /addDisabled=\{Boolean\(selectedSalesOrder\)\}/u)
})

test('shipment source labels prefer immutable snapshots and use current display fallbacks', () => {
  assert.match(source, /product_code_snapshot/u)
  assert.match(source, /product_name_snapshot/u)
  assert.match(source, /item\.product_code/u)
  assert.match(source, /item\.product_name/u)
  assert.match(source, /order\.customer_name/u)
  assert.match(source, /item\.sku_code/u)
  assert.match(source, /item\.sku_name/u)
  assert.doesNotMatch(source, /sku_(?:code|name)_snapshot/u)
  assert.doesNotMatch(source, /selectedSourceRows\.reduce|剩余可出货合计/u)
})
