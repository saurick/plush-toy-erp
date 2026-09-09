import test from 'node:test'
import assert from 'node:assert/strict'
import {
  groupBOMMaterials,
  calculateBOMUsage,
  bomLossRateToPercent,
  bomPercentToLossRate,
  parseBOMPartsPaste,
} from './bomMaterialGroups.mjs'

test('one material is selected once for multiple parts; supplier identities remain separate', () => {
  const groups = groupBOMMaterials([
    { material_id: 1, unit_id: 2, position: '头' },
    { material_id: 2, unit_id: 2, position: '耳' },
    { material_id: 1, unit_id: 2, position: '身体' },
    {},
    {},
  ])
  assert.deepEqual(
    groups.map((group) => group.indexes),
    [[0, 2], [1], [3], [4]]
  )
})
test('BOM totals include loss once; piece count does not multiply recorded unit usage again', () => {
  assert.equal(calculateBOMUsage('0.125', '0.1', '1012'), '139.15')
  assert.equal(calculateBOMUsage('0.000001', '0.1', '1'), '0.000001')
  assert.equal(calculateBOMUsage('0.125', '0.1', ''), '')
  assert.equal(bomLossRateToPercent('0.1'), '10')
  assert.equal(bomPercentToLossRate('10'), '0.1')
  assert.equal(bomPercentToLossRate('1.00001'), null)
})
test('Excel parts paste parses percent, preserves text and rejects missing or invalid numeric results', () => {
  const rows = parseBOMPartsPaste(
    '头\t2\t0.125\t10%\t裁片\t热裁\t注意毛向\n耳朵\t2\t0.025\t5\t裁片\t热裁\t'
  )
  assert.equal(rows[0].loss_rate, '0.1')
  assert.equal(rows[1].loss_rate, '0.05')
  assert.equal(rows[0].piece_count, '2')
  assert.throws(() => parseBOMPartsPaste('头\t2\t=A1*B1\t10'))
  assert.throws(() => parseBOMPartsPaste('0.1\t-1', 2))
  assert.throws(() => parseBOMPartsPaste('头\t2\t0.1\t10\tA\tB\t备注\t多一列'))
})
