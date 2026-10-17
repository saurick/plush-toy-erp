import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ProductionReworkProgressModal.jsx', import.meta.url),
  'utf8'
)

test('rework progress is derived from authoritative lineage and exact completion batches', () => {
  assert.match(source, /buildProductionReworkProgressItems/u)
  assert.match(source, /origin_rework_fact_id/u)
  assert.match(source, /source_batch_id/u)
  assert.match(source, /production_wip_batch_id/u)
  assert.match(source, /FINISHED_GOODS_RECEIPT/u)
  assert.match(source, /acceptedPackagingQuantity/u)
  assert.match(source, /postedQuantity/u)
  assert.match(source, /draftQuantity/u)
  assert.match(source, /compareNumeric20Scale6Values/u)
})

test('rework progress distinguishes cancellation, work, packaging and completion states', () => {
  for (const copy of [
    '已撤销',
    '待安排',
    '待品质检验',
    '手工完成，待成品入库',
    '成品入库草稿待过账',
    '已入库，待查货包装',
    '返工成品已可发货',
  ]) {
    assert.match(source, new RegExp(copy, 'u'))
  }
  assert.match(source, /继续办理返工工序/u)
  assert.match(source, /当前生产订单暂无成品返工进度/u)
})

test('rework progress presents business labels without exposing lineage identifiers', () => {
  assert.match(source, /title="成品返工进度"/u)
  assert.match(source, /当前工序、成品入库及检验包装进度/u)
  assert.match(source, /成品返工补制独立于原生产批次/u)
  assert.match(source, /当前记录/u)
  assert.doesNotMatch(source, />\s*origin_rework_fact_id\s*</u)
  assert.doesNotMatch(source, />\s*production_wip_batch_id\s*</u)
  assert.doesNotMatch(source, />\s*(?:订单|批次|事实)\s*ID\s*</u)
})
