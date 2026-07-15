import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./FinanceBusinessSourceModal.jsx', import.meta.url),
  'utf8'
)

test('finance source modal exposes only operator-owned business fields', () => {
  for (const fieldName of ['fact_no', 'occurred_at', 'note']) {
    assert.match(source, new RegExp(`name="${fieldName}"`, 'u'))
  }
  for (const forbiddenFieldName of [
    'source_type',
    'source_id',
    'counterparty_id',
    'amount',
    'currency',
    'idempotency_key',
  ]) {
    assert.doesNotMatch(source, new RegExp(`name="${forbiddenFieldName}"`, 'u'))
  }
  assert.match(source, /来源、供应商、金额和币种由系统核算/u)
  assert.match(source, /不是多单据核销/u)
  assert.match(source, /label: '产品规格'/u)
  assert.match(source, /outsourcingFactProductSKUText\(record\)/u)
  assert.doesNotMatch(source, /productSKUOption/u)
  assert.doesNotMatch(source, /productSKUs/u)
})

test('finance source modal resets on open and after close', () => {
  assert.match(source, /form\.resetFields\(\)/u)
  assert.match(source, /destroyOnHidden/u)
  assert.match(source, /afterOpenChange/u)
  assert.match(source, /preserve=\{false\}/u)
})
