import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./OutsourcingReturnQualityInspectionModal.jsx', import.meta.url),
  'utf8'
)

test('outsourcing return quality modal exposes only operator-owned business fields', () => {
  for (const field of ['inspection_no', 'note']) {
    assert.match(source, new RegExp(`name="${field}"`, 'u'))
  }
  for (const derivedField of [
    'fact_id',
    'inventory_lot_id',
    'warehouse_id',
    'subject_type',
    'subject_id',
    'source_type',
    'source_id',
    'idempotency_key',
  ]) {
    assert.doesNotMatch(source, new RegExp(`name="${derivedField}"`, 'u'))
  }
  assert.match(source, /产品、仓库、批次和委外来源由已过账回货记录确定/u)
  assert.match(source, /label: '产品规格'/u)
  assert.match(source, /outsourcingFactProductSKUText\(fact\)/u)
  assert.doesNotMatch(source, /productSKUOption/u)
  assert.doesNotMatch(source, /productSKUs/u)
})

test('outsourcing return quality modal resets and freezes during submission', () => {
  assert.match(source, /useEffect\(\(\) =>/u)
  assert.match(source, /\[fact\?\.fact_no, fact\?\.id, form, open\]/u)
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(source, /confirmLoading=\{loading\}/u)
  assert.match(source, /forceRender/u)
  assert.match(source, /closable=\{!loading\}/u)
  assert.match(source, /keyboard=\{!loading\}/u)
  assert.match(source, /maskClosable=\{!loading\}/u)
  assert.match(source, /disabled=\{loading\}/u)
})
