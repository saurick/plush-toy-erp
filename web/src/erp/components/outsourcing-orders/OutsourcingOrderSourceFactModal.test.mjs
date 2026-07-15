import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./OutsourcingOrderSourceFactModal.jsx', import.meta.url),
  'utf8'
)

test('outsourcing source fact modal shows a readable locked source summary', () => {
  for (const label of [
    '委外订单',
    '加工厂',
    '产品 / 材料',
    '工序',
    '单位',
    '计划数量',
    '已登记量',
    '剩余可登记',
  ]) {
    assert.match(source, new RegExp(`label: '${label}'`, 'u'))
  }
  assert.match(source, /material_code_snapshot/u)
  assert.match(source, /product_no_snapshot/u)
  assert.match(source, /sku_code_snapshot/u)
  assert.match(source, /process_name_snapshot/u)
})

test('outsourcing source fact modal only edits operator-owned business fields', () => {
  for (const formField of [
    'warehouse_id',
    'lot_selection',
    'lot_id',
    'new_lot_no',
    'quantity',
    'occurred_at',
    'note',
  ]) {
    assert.match(source, new RegExp(`name="${formField}"`, 'u'))
  }
  for (const serverDerivedField of [
    'fact_type',
    'subject_type',
    'subject_id',
    'supplier_id',
    'unit_id',
    'source_type',
    'source_id',
    'source_line_id',
    'idempotency_key',
  ]) {
    assert.doesNotMatch(source, new RegExp(`name="${serverDerivedField}"`, 'u'))
  }
  assert.match(source, /destroyOnHidden/u)
  assert.match(source, /afterOpenChange=\{initializeOpenForm\}/u)
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(source, /disabled=\{loading\}/u)
})

test('outsourcing return receipt chooses an existing lot or a new lot number', () => {
  assert.match(
    source,
    /actionType === OUTSOURCING_SOURCE_ACTIONS\.RETURN_RECEIPT/u
  )
  assert.match(source, /回货批次方式/u)
  assert.match(source, /选择已有批次/u)
  assert.match(source, /填写新批次号/u)
  assert.match(source, /请选择已有产品批次/u)
  assert.match(source, /请填写本次回货的新批次号/u)
  assert.match(source, /新批次号不能超过 64 个字符/u)
  assert.match(source, /暂无匹配的已有产品批次/u)
  assert.match(source, /lot_id:[\s\S]*new_lot_no: undefined/u)
  assert.match(source, /if \(!error\?\.errorFields\) throw error/u)
})

test('outsourcing material issue remains existing-lot only', () => {
  assert.match(source, /请选择已有材料批次/u)
  assert.match(source, /委外发料只能选择与来源材料匹配的可用批次/u)
  assert.match(
    source,
    /returnReceipt \? \([\s\S]*name="lot_selection"[\s\S]*\) : null/u
  )
})
