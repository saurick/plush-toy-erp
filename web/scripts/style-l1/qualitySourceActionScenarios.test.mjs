import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./qualitySourceActionScenarios.mjs', import.meta.url),
  'utf8'
)

const scenario = source.slice(
  source.indexOf('const productionInspection ='),
  source.indexOf("name: 'quality-defect-rate-decision-dark-narrow'")
)

test('production-stage quality browser scenario uses the dedicated joined WIP read model', () => {
  assert.notEqual(scenario.length, 0)
  assert.match(scenario, /list_production_stage_quality_inspections/u)
  for (const field of [
    'production_order_no',
    'operation_code',
    'operation_name',
    'gate_code',
    'product_code',
    'product_name',
    'wip_batch_no',
    'batch_quantity',
  ]) {
    assert.match(scenario, new RegExp(`${field}:`, 'u'))
  }
  assert.match(scenario, /inventory_lot_id: null/u)
  assert.match(scenario, /warehouse_id: null/u)
})

test('production-stage quality browser scenario proves business copy, disabled inventory filters, and hidden IDs', () => {
  assert.match(scenario, /生产分段质检/u)
  assert.match(scenario, /gate_code: 'SHELL'/u)
  assert.match(scenario, /质量关口：皮套检验/u)
  assert.match(scenario, /生产订单：MO-WIP-STYLE-L1-001/u)
  assert.match(scenario, /在制批次：WIP-SEWING-STYLE-L1-001/u)
  assert.match(scenario, /\['全部仓库', '全部批次'\]/u)
  assert.match(scenario, /ant-select-disabled/u)
  assert.match(scenario, /page\.getByText\(technicalCopy, \{/u)
  assert.match(scenario, /await candidate\.isVisible\(\)/u)
  assert.match(scenario, /生产分段质检页面不应显示原始 ID 或技术字段/u)
  assert.match(scenario, /quality-production-stage-filter-desktop\.png/u)
  assert.match(
    scenario,
    /quality-production-stage-decision-source-desktop\.png/u
  )
  assert.match(
    scenario,
    /modal\s*\.getByRole\('button', \{ name: \/关\\s\*闭\/u \}\)\s*\.click\(\)/u
  )
  assert.doesNotMatch(scenario, /keyboard\.press\('Escape'\)/u)
})

test('quality rejection return mock preserves list-all paging metadata', () => {
  const returnScenario = source.slice(
    source.indexOf("name: 'quality-rejection-purchase-return-dark-narrow'"),
    source.indexOf("name: 'outsourcing-return-quality-create-desktop'")
  )
  assert.match(returnScenario, /method === 'list_purchase_receipts'/u)
  assert.match(returnScenario, /limit: Number\(params\.limit \|\| 50\)/u)
  assert.match(returnScenario, /method === 'list_purchase_returns'/u)
  assert.match(returnScenario, /limit: Number\(params\.limit \|\| 20\)/u)
  assert.match(returnScenario, /offset: Number\(params\.offset \|\| 0\)/u)
})

test('outsourcing return quality scenario follows the unified records entrypoint', () => {
  const outsourcingScenario = source.slice(
    source.indexOf("name: 'outsourcing-return-quality-create-desktop'"),
    source.indexOf("name: 'shipment-finished-goods-quality-create-desktop'")
  )
  assert.match(outsourcingScenario, /clickSelectionAction\(page, '委外记录'\)/u)
  assert.match(outsourcingScenario, /name: \/委外记录\/u/u)
  assert.match(outsourcingScenario, /质检草稿已生成，请在委外记录中继续办理/u)
  assert.doesNotMatch(outsourcingScenario, /相关回货记录/u)
})

test('finished-goods quality list mock uses the shared paging contract', () => {
  const finishedGoodsScenario = source.slice(
    source.indexOf("name: 'shipment-finished-goods-quality-create-desktop'")
  )
  for (const [method, recordKey] of [
    ['list_shipments', 'shipments'],
    ['list_finished_goods_quality_inspections', 'quality_inspections'],
    ['list_quality_inspections', 'quality_inspections'],
  ]) {
    const methodIndex = finishedGoodsScenario.indexOf(method)
    const listCase = finishedGoodsScenario.slice(methodIndex, methodIndex + 900)
    assert.ok(methodIndex >= 0, method)
    assert.match(listCase, /stylePaginatedRpcData/u)
    assert.match(listCase, new RegExp(`'${recordKey}'`, 'u'))
  }
  assert.doesNotMatch(finishedGoodsScenario, /limit:\s*200|offset:\s*0/u)
})
