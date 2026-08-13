import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ProductionCompletionModal.jsx', import.meta.url),
  'utf8'
)

test('production completion edit keeps source line and WIP batch locked', () => {
  assert.match(source, /mode = 'create'/u)
  assert.match(source, /excludeFactID/u)
  assert.match(source, /核对待入库完工报告/u)
  assert.ok((source.match(/disabled=\{editing\}/gu)?.length || 0) >= 2)
  assert.match(source, /initialValues\?\.production_order_item_id/u)
  assert.match(source, /initialValues\?\.production_wip_batch_id/u)
})

test('production completion chooses an existing lot or a new lot number in business language', () => {
  for (const copy of [
    '入库批次方式',
    '选择已有批次',
    '填写新批次号',
    '已有入库批次',
    '新批次号',
  ]) {
    assert.match(source, new RegExp(copy, 'u'))
  }
  for (const technicalCopy of [
    '>lot_id<',
    '>new_lot_no<',
    '>idempotency_key<',
    '>source_id<',
  ]) {
    assert.equal(source.includes(technicalCopy), false, technicalCopy)
  }
})

test('production completion resets stale lot fields on open, line and mode changes', () => {
  assert.match(source, /destroyOnHidden/u)
  assert.match(source, /afterOpenChange=\{initializeOpenForm\}/u)
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(
    source,
    /production_wip_batch_id:\s*initialValues\?\.production_wip_batch_id\s*\|\|\s*firstBatch\?\.value,[\s\S]*lot_id:[\s\S]*new_lot_no:\s*initialValues\?\.new_lot_no,[\s\S]*occurred_at/u
  )
  assert.match(
    source,
    /production_wip_batch_id:\s*nextBatch\?\.value,[\s\S]*lot_id:[\s\S]*new_lot_no: undefined/u
  )
  assert.match(
    source,
    /React\.useEffect\(\(\) => \{[\s\S]*selectedChoice\?\.requiresBatch[\s\S]*production_wip_batch_id:\s*firstBatch\.value,[\s\S]*quantity:\s*firstBatch\.remaining/u
  )
  assert.match(
    source,
    /name="production_wip_batch_id"[\s\S]*onChange=\{\(value\)[\s\S]*setFieldValue\('quantity'/u
  )
  assert.match(
    source,
    /onChange=\{\(event\)[\s\S]*lot_id:[\s\S]*new_lot_no: undefined/u
  )
})

test('production completion requires one bounded lot input and handles validation locally', () => {
  assert.match(source, /请选择拟使用的已有入库批次/u)
  assert.match(source, /请填写本次完工的新批次号/u)
  assert.match(source, /max: 64/u)
  assert.match(source, /if \(!error\?\.errorFields\) throw error/u)
  assert.match(source, /disabled=\{loading\}/u)
})

test('production completion defaults and validates against the current completion cap', () => {
  assert.match(
    source,
    /quantity:\s*initialValues\?\.quantity\s*\|\|\s*firstBatch\?\.remaining\s*\|\|\s*firstAvailable\?\.remaining/u
  )
  assert.match(source, /完工来源批次/u)
  assert.match(source, /所选批次/u)
  assert.match(source, /已入库/u)
  assert.match(source, /待入库/u)
  assert.match(source, /compareProductionCompletionQuantity/u)
  assert.match(source, /不能超过所选包装验收批次/u)
  assert.doesNotMatch(source, /包装已合格/u)
  assert.match(source, /maxLength=\{21\}/u)
  assert.doesNotMatch(source, /const quantity = Number\(value\)/u)
})

test('closed production orders expose only finished-goods rework completion wording', () => {
  assert.match(source, /wipAggregate\s*=\s*null/u)
  assert.match(
    source,
    /buildProductionCompletionChoices\(items,\s*facts,\s*wipAggregate,\s*\{\s*excludeFactID,\s*\}\s*\)/u
  )
  assert.match(source, /order\?\.status === 'CLOSED'/u)
  assert.match(source, /登记返工补完工/u)
  assert.match(source, /成品返工补制批次/u)
  assert.doesNotMatch(source, />production_wip_batch_id</u)
  assert.doesNotMatch(source, />origin_rework_fact_id</u)
})
