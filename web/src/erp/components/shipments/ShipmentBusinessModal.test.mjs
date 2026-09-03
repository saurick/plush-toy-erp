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
  assert.match(source, /sourceSelectionOnly=\{isWritableModal\}/u)
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

test('shipment create and edit share one writable field tree while view is immutable', () => {
  assert.match(
    source,
    /const isWritableModal = isCreateModal \|\| isEditModal/u
  )
  assert.match(
    source,
    /const canSave = isCreateModal \? canCreate : isEditModal \? canUpdate : false/u
  )
  assert.match(source, /disabled=\{!isWritableModal\}/u)
  assert.match(
    source,
    /\{isWritableModal \? \([\s\S]*?<Form\.List name="items">/u
  )
  assert.match(source, /canUpload=\{isWritableModal && canSave\}/u)
  assert.match(source, /canWithdraw=\{isWritableModal && canSave\}/u)
  assert.doesNotMatch(source, /canWithdraw=\{canCreate \|\| canShip\}/u)
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

test('shipment logistics fields keep freight on the sales-order currency and remain before attachments and details', () => {
  for (const copy of [
    '计划与收货',
    '国家 / 地区',
    '收货人',
    '收货电话',
    '收货地址',
    '运输与包装',
    '运输方式',
    '承运商',
    '物流 / 提单号',
    '件数 / 箱数',
    '毛重（千克）',
    '体积（立方米）',
    '唛头',
    '实际运费',
    '实际运费金额',
    '币种（跟随销售订单）',
    '包装说明',
    '箱号',
  ]) {
    assert.match(source, new RegExp(copy.replaceAll('/', '\\/'), 'u'))
  }
  assert.match(
    source,
    /只记录本次出货的实际物流金额，并沿用销售订单币种；不自动生成应付或付款记录/u
  )
  assert.match(source, /<FieldWithUnitSuffix/u)
  assert.match(source, /suffixAriaLabel="实际运费币种（自动）"/u)
  assert.match(source, /sourceCurrency=\{/u)
  assert.match(source, /throw new Error\('请先导入销售订单以确定单据币种'\)/u)
  assert.doesNotMatch(source, /label="实际运费币种"/u)
  assert.doesNotMatch(source, /BUSINESS_CURRENCY_OPTIONS/u)
  assert.doesNotMatch(source, /addonAfter=/u)
  assert.doesNotMatch(source, /name="freight_currency"/u)

  const fieldsIndex = source.indexOf('<ShipmentFormFields')
  const attachmentsIndex = source.indexOf('<BusinessAttachmentPanel')
  const itemsIndex = source.indexOf('<Form.List name="items">')
  assert(fieldsIndex >= 0)
  assert(attachmentsIndex > fieldsIndex)
  assert(itemsIndex > attachmentsIndex)
})
