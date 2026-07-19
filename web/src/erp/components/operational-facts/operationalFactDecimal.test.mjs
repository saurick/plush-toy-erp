import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareOperationalFactDecimalValues,
  formatOperationalFactDecimal,
} from './operationalFactDecimal.mjs'

test('operational fact decimals preserve numeric(20,6) micro and maximum values', () => {
  assert.equal(formatOperationalFactDecimal('0.000001'), '0.000001')
  assert.equal(
    formatOperationalFactDecimal('99999999999999.999999'),
    '99999999999999.999999'
  )
})

test('operational fact decimals compare adjacent large values without Number rounding', () => {
  assert.equal(
    compareOperationalFactDecimalValues(
      '99999999999999.999998',
      '99999999999999.999999'
    ),
    -1
  )
  assert.equal(compareOperationalFactDecimalValues('0.000001', '0'), 1)
  assert.equal(compareOperationalFactDecimalValues('', '0'), 1)
})
