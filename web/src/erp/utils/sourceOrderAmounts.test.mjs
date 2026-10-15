import assert from 'node:assert/strict'
import test from 'node:test'
import { formatUnitQuantitySummary } from './sourceOrderAmounts.mjs'

test('quantity summaries keep different units separate and preserve small decimal values', () => {
  const options = [
    { value: 1, label: '个' },
    { value: 2, label: '码' },
  ]
  assert.equal(
    formatUnitQuantitySummary(
      [
        { unit_id: 1, quantity: '12' },
        { unit_id: 2, quantity: '0.000001' },
        { unit_id: 1, quantity: '3' },
        { unit_id: 2, quantity: '1.000002' },
      ],
      'quantity',
      options
    ),
    '15 个 / 1.000003 码'
  )
  assert.equal(formatUnitQuantitySummary([{ quantity: '10' }]), '待选择单位')
  assert.equal(
    formatUnitQuantitySummary(
      [{ unit_id: 1, quantity: '' }],
      'quantity',
      options
    ),
    '—'
  )
})
