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
  assert.match(scenario, /生产分段质检页面不应显示原始 ID 或技术字段/u)
  assert.match(scenario, /quality-production-stage-filter-desktop\.png/u)
  assert.match(
    scenario,
    /quality-production-stage-decision-source-desktop\.png/u
  )
})
