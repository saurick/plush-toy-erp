import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ProductionMaterialIssueModal.jsx', import.meta.url),
  'utf8'
)

test('production material issue modal only exposes operator-owned business fields', () => {
  for (const label of [
    '生产订单',
    '生产产品',
    '需求物料',
    '计划需求',
    '已过账领料',
    '剩余可领',
    '领料仓库',
    '材料批次',
    '本次领料数量',
    '领料时间',
    '备注',
  ]) {
    assert.match(source, new RegExp(label, 'u'))
  }
  for (const technicalCopy of [
    '>material_id<',
    '>unit_id<',
    '>source_type<',
    '>source_id<',
    '>idempotency_key<',
  ]) {
    assert.equal(source.includes(technicalCopy), false, technicalCopy)
  }
  assert.match(source, /destroyOnHidden/u)
  assert.match(source, /afterOpenChange=\{initializeOpenForm\}/u)
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(source, /disabled: loading \|\| lotsLoading/u)
})

test('production material issue modal enforces remaining quantity and matching lot', () => {
  assert.match(source, /领料数量不能超过当前剩余需求/u)
  assert.match(source, /请选择匹配的材料批次/u)
  assert.match(source, /暂无匹配的可用批次/u)
  assert.match(source, /onWarehouseChange\?\.\(value\)/u)
  assert.match(source, /numeric20Scale6Units\(value\)/u)
  assert.match(source, /compareNumeric20Scale6Units\(quantity, remaining\)/u)
  assert.doesNotMatch(source, /const quantity = Number\(value\)/u)
})
