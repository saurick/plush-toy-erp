import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ShipmentQualityInspectionModal.jsx', import.meta.url),
  'utf8'
)

test('shipment quality modal states its narrow business outcome', () => {
  assert.match(source, /title="发起出货前成品检验"/u)
  assert.match(source, /这里只生成出货前成品检验草稿/u)
  assert.match(source, /不启动任务流程/u)
  assert.match(source, /不代表已经出货/u)
  assert.match(source, /产品、规格、仓库和批次由出货单确定/u)
  assert.doesNotMatch(source, /\bWorkflow\b/u)
})

test('shipment quality modal exposes business fields without raw source IDs', () => {
  for (const field of ['inspection_batch', 'inspection_no', 'note']) {
    assert.match(source, new RegExp(`name="${field}"`, 'u'))
  }
  for (const derivedField of [
    'shipment_id',
    'product_id',
    'product_sku_id',
    'warehouse_id',
    'finished_goods_lot_id',
    'inventory_lot_id',
    'source_type',
    'source_id',
    'subject_type',
    'subject_id',
    'idempotency_key',
  ]) {
    assert.doesNotMatch(source, new RegExp(`name="${derivedField}"`, 'u'))
  }
  for (const label of [
    "label: '出货单'",
    "label: '送检产品'",
    "label: '仓库'",
    "label: '成品批次'",
    "label: '出货数量合计'",
    'label="送检批次"',
    'label="检验单号（自动）"',
    'label="送检备注"',
  ]) {
    assert.equal(source.includes(label), true, label)
  }
  assert.doesNotMatch(source, /(?:产品|仓库|批次|出货单)\s*#/u)
})

test('shipment quality modal handles unavailable, merged and stale selections', () => {
  assert.match(source, /disabled: Boolean\(source\.unavailableReason\)/u)
  assert.match(source, /当前出货单没有可送检批次/u)
  assert.match(source, /当前出货单暂时没有可发起检验的批次/u)
  assert.match(source, /合并 \$\{selectedSource\.lineCount\} 条相同批次明细/u)
  assert.match(source, /sourceByKey\.get\(values\.inspection_batch\)/u)
  assert.match(source, /errors: \['请选择可送检的成品批次'\]/u)
  assert.match(source, /onSubmit\?\.\(values, selected\)/u)
})

test('shipment quality modal resets and freezes during submission', () => {
  assert.match(source, /sourceBusinessActionNo\(/u)
  assert.match(
    source,
    /<Input maxLength=\{64\} autoComplete="off" readOnly \/>/u
  )
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(source, /confirmLoading=\{loading\}/u)
  assert.match(source, /forceRender/u)
  assert.match(source, /closable=\{!loading\}/u)
  assert.match(source, /keyboard=\{!loading\}/u)
  assert.match(source, /maskClosable=\{!loading\}/u)
  assert.match(source, /disabled=\{loading\}/u)
  assert.match(
    source,
    /okButtonProps=\{\{ disabled: availableSources\.length === 0 \}\}/u
  )
})
