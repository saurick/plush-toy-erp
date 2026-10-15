import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isQuantityTextWithinUnitPrecision as valid,
  unitQuantityRule,
  unitQuantityRuleFromOptions,
  unitPrecisionFromOptions,
} from './unitQuantity.mjs'

test('quantity precision is exact and never rounds user input', () => {
  for (const [value, precision, expected] of [
    ['1', 0, true],
    ['1.000', 0, true],
    ['0.5', 0, false],
    ['-1.5', 0, false],
    ['-1', 0, true],
    ['0.001', 3, true],
    ['0.0001', 3, false],
    ['0.000001', 6, true],
    ['0.0000001', 6, false],
    ['100000000000000', 0, false],
    ['1e3', 0, false],
    ['1,2', 0, false],
    ['NaN', 6, false],
    ['1', undefined, false],
    ['1', 7, false],
  ]) {
    assert.equal(valid(value, precision), expected, `${value}/${precision}`)
  }
})

test('positive business quantities reject zero and negatives without changing signed adjustments', async () => {
  const positive = unitQuantityRule(3, { positive: true })
  for (const value of ['0', '0.000', '-1', 'abc', '0.0000001', ' ']) {
    await assert.rejects(positive.validator(null, value), /数量必须大于 0/u)
  }
  await assert.rejects(positive.validator(null, '0.0001'), /最多允许 3 位/u)
  await positive.validator(null, '0.001')
  await positive.validator(null, '1')
  // Required fields own the empty check; counts and adjustments still allow zero/signs.
  await positive.validator(null, '')
  await unitQuantityRule(3).validator(null, '0')
  await unitQuantityRule(3).validator(null, '-1.25')
})

test('changing or clearing the unit revalidates existing quantity', async () => {
  const options = [
    { value: 1, precision: 0 },
    { value: 2, precision: 3 },
  ]
  let id = 2
  const rule = unitQuantityRuleFromOptions(options, () => id)
  await rule.validator(null, '1.25')
  id = 1
  await assert.rejects(rule.validator(null, '1.25'), /整数/)
  id = undefined
  await assert.rejects(rule.validator(null, '1.25'), /选择/)
  assert.equal(
    unitPrecisionFromOptions([{ value: 3, precision: null }], 3),
    undefined
  )
})
