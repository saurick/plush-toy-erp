import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPaymentMethodOptions } from './paymentConditions.mjs'

test('payment method candidates trim and deduplicate names without attaching a payment period', () => {
  const options = buildPaymentMethodOptions([' 银行转账 ', '', '商业承兑', '商业承兑', null])
  assert.deepEqual(options.map((option) => option.value), ['银行转账', '商业承兑'])
  assert.equal(options.every((option) => !Object.hasOwn(option, 'payment_term_days')), true)
})

test('payment method search offers maintained names only and never publishes typed text', () => {
  assert.deepEqual(buildPaymentMethodOptions(['Wire'], ' wire '), [{ value: 'Wire', label: 'Wire' }])
  assert.deepEqual(buildPaymentMethodOptions([], '商业承兑'), [])
  assert.deepEqual(buildPaymentMethodOptions(['商业承兑'], ' 商业承兑 '), [{ value: '商业承兑', label: '商业承兑' }])
})

test('client never restores defaults omitted by the server recommendation policy', () => {
  assert.deepEqual(buildPaymentMethodOptions([]), [])
})
