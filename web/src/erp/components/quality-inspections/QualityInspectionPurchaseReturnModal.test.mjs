import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./QualityInspectionPurchaseReturnModal.jsx', import.meta.url),
  'utf8'
)

test('quality purchase return modal only asks for return business intent', () => {
  for (const field of [
    'return_no',
    'quantity',
    'returned_at',
    'reason',
    'note',
  ]) {
    assert.match(source, new RegExp(`name="${field}"`, 'u'))
  }
  for (const derivedField of [
    'quality_inspection_id',
    'purchase_receipt_id',
    'purchase_receipt_item_id',
    'supplier_id',
    'material_id',
    'warehouse_id',
    'unit_id',
    'lot_id',
    'idempotency_key',
  ]) {
    assert.doesNotMatch(source, new RegExp(`name="${derivedField}"`, 'u'))
  }
  assert.match(
    source,
    /供应商、材料、仓库、批次和单位会根据这次不合格检验自动带入/u
  )
  assert.match(source, /确认退货后，相应批次的库存会同步扣减/u)
  assert.doesNotMatch(source, /写库存|库存流水|库存冲正/u)
})

test('quality purchase return modal prevents duplicate submission and stale fields', () => {
  assert.match(source, /useEffect\(\(\) =>/u)
  assert.match(
    source,
    /\[form, inspection\?\.id, inspection\?\.inspection_no, open\]/u
  )
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(source, /confirmLoading=\{loading\}/u)
  assert.match(source, /okButtonProps=\{\{ disabled: !referenceDataReady \}\}/u)
  assert.match(source, /forceRender/u)
  assert.match(source, /disabled=\{loading \|\| !referenceDataReady\}/u)
  assert.match(source, /closable=\{!loading\}/u)
  assert.match(source, /keyboard=\{!loading\}/u)
  assert.match(source, /maskClosable=\{!loading\}/u)
})

test('quality purchase return quantity uses the exact numeric(20,6) contract', () => {
  assert.match(source, /numeric20Scale6Units\(value\)/u)
  assert.match(source, /isPositiveNumeric20Scale6Units/u)
  assert.doesNotMatch(source, /Number\(value\) > 0/u)
})
