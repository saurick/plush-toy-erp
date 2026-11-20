import assert from 'node:assert/strict'
import test from 'node:test'
import {
  optionalMoneyRule,
  salesOrderCommercialIssues,
  salesOrderCommercialRule,
} from './sourceOrderValidation.mjs'

const valid = { tax_mode: 'NONE', freight_terms: 'INCLUDED' }
const fields = (values) =>
  salesOrderCommercialIssues(values).map(({ name }) => name[0])

test('sales pricing requires explicit choices and never defaults missing choices', () => {
  assert.deepEqual(fields(valid), [])
  for (const missing of [undefined, null, '', 'UNKNOWN']) {
    assert.deepEqual(fields({ ...valid, tax_mode: missing }), ['tax_mode'])
    assert.deepEqual(fields({ ...valid, freight_terms: missing }), [
      'freight_terms',
    ])
  }
  assert.deepEqual(fields({}), ['tax_mode', 'freight_terms'])
})

test('taxable pricing enforces the rate range and decimal precision', () => {
  for (const tax_mode of ['INCLUSIVE', 'EXCLUSIVE']) {
    for (const tax_rate of [
      undefined,
      '',
      '0',
      '-1',
      '100.000001',
      '0.0000001',
      'abc',
      '1,3',
    ]) {
      assert.deepEqual(fields({ ...valid, tax_mode, tax_rate }), ['tax_rate'])
    }
    for (const tax_rate of ['0.000001', '13', '100']) {
      assert.deepEqual(fields({ ...valid, tax_mode, tax_rate }), [])
    }
  }
})

test('separate freight requires an explicit amount and permits zero', () => {
  for (const quoted_freight_amount of [
    undefined,
    '',
    ' ',
    '-1',
    '0.0000001',
    'abc',
    '1,2',
  ]) {
    assert.deepEqual(
      fields({ ...valid, freight_terms: 'EXCLUDED', quoted_freight_amount }),
      ['quoted_freight_amount']
    )
  }
  for (const quoted_freight_amount of [0, '0', '0.000001', '25']) {
    assert.deepEqual(
      fields({ ...valid, freight_terms: 'EXCLUDED', quoted_freight_amount }),
      []
    )
  }
})

test('form rules read current choices after switching or clearing them', async () => {
  let values = { ...valid, tax_mode: 'INCLUSIVE', freight_terms: 'EXCLUDED' }
  const form = { getFieldsValue: () => values }
  const rate = salesOrderCommercialRule(form, 'tax_rate')
  const freight = salesOrderCommercialRule(form, 'quoted_freight_amount')
  await assert.rejects(rate.validator(null, undefined), /填写税率/u)
  await assert.rejects(freight.validator(null, undefined), /填写报价运费/u)
  values = { ...valid }
  await rate.validator(null, undefined)
  await freight.validator(null, undefined)
  await assert.rejects(
    salesOrderCommercialRule(form, 'tax_mode').validator(null, undefined),
    /请选择计税方式/u
  )
  await assert.rejects(
    salesOrderCommercialRule(form, 'freight_terms').validator(null, undefined),
    /请选择报价是否含运费/u
  )
})

test('optional money permits a draft blank but blocks invalid entered values', async () => {
  const rule = optionalMoneyRule('单价')
  for (const value of [undefined, null, '', ' ', 0, '0', '0.000001']) {
    await rule.validator(null, value)
  }
  for (const value of ['-1', '0.0000001', 'abc', '100000000000000', '1,2']) {
    await assert.rejects(rule.validator(null, value), /单价必须为非负数/u)
  }
})
