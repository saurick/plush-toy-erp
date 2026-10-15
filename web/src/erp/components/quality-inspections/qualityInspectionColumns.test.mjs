import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./qualityInspectionColumns.jsx', import.meta.url),
  'utf8'
)

test('quality inspection columns distinguish business source and subject grain', () => {
  assert.match(source, /OUTSOURCING_RETURN: '委外回货'/u)
  assert.match(source, /INCOMING: '采购来料'/u)
  assert.match(source, /sourceType === 'OUTSOURCING_FACT'/u)
  assert.match(source, /subjectType === 'PRODUCT'/u)
  assert.match(source, /productOptions/u)
  assert.match(source, /title: '检验来源'/u)
  assert.match(source, /sourceNo \|\|/u)
  assert.match(source, /title: '产品 \/ 材料 \/ 在制品'/u)
  assert.doesNotMatch(source, /title: '采购来源'/u)
  assert.doesNotMatch(source, /title: '物料批次'/u)
})

test('quality inspection columns expose production-stage gates as separate Chinese quality decisions', () => {
  assert.match(source, /PRODUCTION_STAGE: '生产分段质检'/u)
  for (const [gateCode, label] of [
    ['CUT_PIECE', '裁片检验'],
    ['SHELL', '皮套检验'],
    ['FINISHED_GOODS', '成品检验'],
    ['NEEDLE', '针检'],
    ['SAMPLING', '抽检'],
    ['CUSTOMER_ACCEPTANCE', '客户验货'],
  ]) {
    assert.match(source, new RegExp(`${gateCode}: '${label}'`, 'u'))
  }
  assert.match(source, /productionQualityGateLabel/u)
})

test('production-stage columns use backend WIP business snapshots without requiring inventory lot or warehouse', () => {
  const wipProjection = source.slice(
    source.indexOf('function productionWipProductLabel'),
    source.indexOf('function qualityDefectRateText')
  )
  for (const businessField of [
    'production_order_no',
    'product_code',
    'product_name',
    'operation_name',
    'wip_batch_no',
    'batch_quantity',
    'gate_code',
  ]) {
    assert.match(wipProjection, new RegExp(`record\\?\\.${businessField}`, 'u'))
  }
  assert.doesNotMatch(
    wipProjection,
    /production_order_id|production_order_item_id|production_wip_batch_id|inventory_lot_id|warehouse_id|defect_quantity|inspector_name|\bremark\b/u
  )
  assert.match(
    source,
    /isProductionStageQualityInspection\(record\)[\s\S]*?'—'/u
  )
})

test('quality inspection columns keep technical source identifiers out of visible fallbacks', () => {
  assert.match(source, /委外回货记录已关联/u)
  assert.match(source, /业务来源已关联/u)
  assert.doesNotMatch(source, /`[^`]*\$\{record\?\.source_id/u)
  assert.doesNotMatch(source, /`[^`]*\$\{record\?\.subject_id/u)
})

test('quality inspection columns expose the estimated defect rate in list, details, and export', () => {
  assert.match(source, /formatQualityDefectRate/u)
  assert.equal(source.match(/title: '估算不良比例'/gu)?.length, 2)
  assert.equal(source.match(/exportTitle: '估算不良比例'/gu)?.length, 2)
  assert.equal(source.match(/sortable: false/gu)?.length, 2)
  assert.match(source, /dataIndex: 'defect_rate_percent'/u)
})
