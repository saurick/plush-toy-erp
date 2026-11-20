import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatBOMSourceNumber,
  normalizeBOMSourceNumber,
  roundBOMSourceNumber,
  sumBOMSourceNumbers,
  bomSourceColumnLabel,
  inferBOMSourceLossRate,
} from './bomSourceValues.mjs'
import { getBOMUsage, calculateBOMUsage, invalidateBOMUsageSnapshots, bindBOMMaterialReference } from './bomMaterialGroups.mjs'

test('BOM source numbers round with decimal arithmetic and retain Excel display precision', () => {
  assert.equal(roundBOMSourceNumber('0.0123456789012345', 6), '0.012346')
  assert.equal(roundBOMSourceNumber('1.0000005', 6), '1.000001')
  assert.equal(roundBOMSourceNumber('0.00000049', 6), '0')
  assert.equal(normalizeBOMSourceNumber('1.23456789012345e-2'), '0.0123456789012345')
  assert.equal(formatBOMSourceNumber('0.0123456789012345', '0.000'), '0.012')
  assert.equal(formatBOMSourceNumber('1.358024679135795', '0.00_);\\(0.00\\)'), '1.36')
  assert.equal(formatBOMSourceNumber('0.1', '0%'), '10%')
  assert.equal(formatBOMSourceNumber('1234.5', '#,##0.00'), '1,234.50')
  assert.equal(formatBOMSourceNumber('0', '0.00'), '0.00')
  assert.equal(formatBOMSourceNumber('13', '0000'), '0013')
  assert.equal(formatBOMSourceNumber('0.00001', 'General'), '0.00001')
})

test('BOM source limits reject hostile or unrepresentable values without treating them as zero', () => {
  for (const value of ['1e999999', '-1', 'NaN', 'Infinity', '1e-325', '100000000000000', `0.${'1'.repeat(385)}`]) {
    assert.equal(normalizeBOMSourceNumber(value), '', value)
  }
  assert.equal(sumBOMSourceNumbers(['1', 'invalid']), '')
  assert.equal(sumBOMSourceNumbers(['0.0123456789012345', '0.0000000000000005']), '0.012345678901235')
})

test('source totals preserve precision for the same inputs, then use saved quantities after editing', () => {
  const item = { quantity: '0.0123456789012345', loss_rate: '0.1', total_usage_snapshot: '1.358024679135795', source_snapshot: { order_quantity: '100', quantity_value: '0.0123456789012345', loss_rate: '0.1', total_label: '总用量 含损耗10%' } }
  assert.equal(getBOMUsage(item, '100'), '1.358024679135795')
  assert.equal(getBOMUsage(item, '200'), '2.71604935827159')
  const changed = invalidateBOMUsageSnapshots([item], { items: [{ quantity: '0.02' }] })[0]
  assert.equal(changed.total_usage_snapshot, undefined)
  assert.equal(changed.source_snapshot.quantity_value, item.source_snapshot.quantity_value)
  assert.equal(bomSourceColumnLabel([item], 'total', '总用量含损耗'), '总用量 含损耗10%')
  assert.equal(bomSourceColumnLabel([item, {}], 'total', '总用量含损耗'), '总用量含损耗')
  assert.equal(bomSourceColumnLabel([{ ...item, loss_rate: '0.05' }], 'total', '总用量含损耗'), '总用量含损耗')
})

test('source loss inference uses the full decimal values without binary floating-point arithmetic', () => {
  assert.equal(inferBOMSourceLossRate({ orderQuantity: '100', unitQuantity: '0.0123456789012345', totalQuantity: '1.358024679135795' }), '0.1')
  assert.equal(inferBOMSourceLossRate({ orderQuantity: '100', unitQuantity: '0.000000000000123456789012345', totalQuantity: '0.00000000001358024679135795' }), '0.1')
  assert.equal(inferBOMSourceLossRate({ orderQuantity: '', unitQuantity: '1', totalQuantity: '100' }), null)
})

test('initial association preserves an imported total even after Form has applied the selected material ID', () => {
  const item = { material_id: 9, unit_id: 1, total_usage_snapshot: '1.358024679135795', source_snapshot: { quantity_value: '0.0123456789012345' }, _import_source: {} }
  const linked = bindBOMMaterialReference(item, { id: 9, default_unit_id: 1 })
  assert.equal(linked.total_usage_snapshot, item.total_usage_snapshot)
  assert.equal(linked._import_source.associatedMaterialID, 9)
  assert.equal(bindBOMMaterialReference(linked, { id: 10, default_unit_id: 1 }).total_usage_snapshot, undefined)
  assert.equal(bindBOMMaterialReference(item, { id: 9, default_unit_id: 2 }).total_usage_snapshot, undefined)
})

test('BOM calculations retain full coefficients and intermediate digits while display formatting stays separate', () => {
  assert.equal(calculateBOMUsage('0.009090909090909', '0.1', '100'), '0.99999999999999')
  const raw = calculateBOMUsage('0.12345678901234567890123456789', '0.12345678901234567890123456789', '100')
  assert.equal(raw, '13.86983677655845156517299194525361987875019051998750190521')
  assert.equal(formatBOMSourceNumber(raw, '0.00'), '13.87')
  assert.equal(formatBOMSourceNumber('1e-324', 'General'), `0.${'0'.repeat(323)}1`)
  assert.equal(getBOMUsage({ quantity: '0.0123456789012345', loss_rate: '0.1', total_usage_snapshot: '1.36', source_snapshot: { order_quantity: '100' } }, '100'), '1.358024679135795')
})
