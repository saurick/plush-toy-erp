import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addNumeric20Scale6Units,
  compareNumeric20Scale6Values,
  compareNumeric20Scale6Units,
  formatNumeric20Scale6,
  formatNumeric20Scale6Summary,
  normalizeNumeric20Scale6,
  normalizePositiveNumeric20Scale6,
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
  subtractNumeric20Scale6Units,
  sumNumeric20Scale6Values,
} from './numeric20Scale6.mjs'

test('numeric(20,6) helper preserves the smallest and largest values exactly', () => {
  assert.equal(numeric20Scale6Units('0.000001'), '1')
  assert.equal(normalizeNumeric20Scale6('0.000001'), '0.000001')
  assert.equal(formatNumeric20Scale6('0.000001'), '0.000001')

  const maximum = '99999999999999.999999'
  assert.equal(numeric20Scale6Units(maximum), '99999999999999999999')
  assert.equal(normalizeNumeric20Scale6(maximum), maximum)
  assert.equal(
    numeric20Scale6TextFromUnits('99999999999999999999'),
    maximum
  )
})

test('numeric(20,6) scaled strings add, subtract and compare exactly', () => {
  const maximumUnits = numeric20Scale6Units('99999999999999.999999')
  assert.equal(addNumeric20Scale6Units('1', maximumUnits), '100000000000000000000')
  assert.equal(
    subtractNumeric20Scale6Units(maximumUnits, '1'),
    '99999999999999999998'
  )
  assert.equal(subtractNumeric20Scale6Units('1', maximumUnits), '0')
  assert.equal(compareNumeric20Scale6Units(maximumUnits, '1'), 1)
})

test('numeric(20,6) helper emits canonical strings without Number rounding', () => {
  assert.equal(normalizeNumeric20Scale6('000,001.230000'), '1.23')
  assert.equal(normalizeNumeric20Scale6('0.000000'), '0')
  assert.equal(normalizePositiveNumeric20Scale6('0.000000'), '')
  assert.equal(normalizePositiveNumeric20Scale6('2.500000'), '2.5')
  assert.equal(formatNumeric20Scale6('not-a-number'), '0')
})

test('numeric(20,6) helper rejects overflow, excess scale and exponent notation', () => {
  for (const value of [
    '100000000000000',
    '99999999999999.9999999',
    '1e-6',
    '-1',
    '',
    null,
  ]) {
    assert.equal(numeric20Scale6Units(value), null, String(value))
  }
})

test('numeric(20,6) raw values sort and summarize without Number rounding', () => {
  assert.equal(
    compareNumeric20Scale6Values(
      '99999999999999.999999',
      '99999999999999.999998'
    ),
    1
  )
  assert.equal(compareNumeric20Scale6Values('0.000001', '0.000002'), -1)
  assert.equal(
    sumNumeric20Scale6Values([
      '99999999999999.999999',
      '0.000001',
      'invalid',
    ]),
    '100000000000000'
  )
  assert.equal(formatNumeric20Scale6Summary('0.000001', 2), '0.000001')
  assert.equal(formatNumeric20Scale6Summary('1.2', 3), '1.200')
  assert.equal(formatNumeric20Scale6Summary('0', 2), '0.00')
})
