import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./OutsourcingReturnRecordsModal.jsx', import.meta.url),
  'utf8'
)

test('related outsourcing records only project return receipts', () => {
  assert.match(source, /fact_type/u)
  assert.match(source, /RETURN_RECEIPT/u)
  assert.match(source, /相关回货记录/u)
  assert.match(source, /暂无委外回货记录/u)
  assert.doesNotMatch(source, /dataIndex:\s*'source_/u)
  assert.doesNotMatch(source, /dataIndex:\s*'idempotency_key'/u)
  assert.match(source, /title: '产品规格'/u)
  assert.match(source, /outsourcingFactProductSKUText\(fact\)/u)
  assert.doesNotMatch(source, /productSKUOption/u)
  assert.doesNotMatch(source, /productSKUs/u)
})

test('payable and quality actions fail closed on posted and accepted quality state', () => {
  assert.match(source, /selectedPosted/u)
  assert.match(source, /canCreatePayable/u)
  assert.match(source, /canCreateQualityInspection/u)
  assert.match(source, /hasActiveQualityInspection/u)
  assert.match(source, /resolveOutsourcingReturnQualityGate/u)
  assert.match(source, /OUTSOURCING_RETURN_QUALITY_GATE_STATES\.ACCEPTED/u)
  assert.match(source, /selectedPayableEligible/u)
  assert.match(source, /title: '质检状态'/u)
  assert.match(source, /判定合格或让步接收后才能生成应付/u)
  assert.match(source, /生成应付/u)
  assert.match(source, /已发起质检/u)
})
