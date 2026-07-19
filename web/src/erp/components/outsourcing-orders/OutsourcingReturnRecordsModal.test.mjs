import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./OutsourcingReturnRecordsModal.jsx', import.meta.url),
  'utf8'
)

test('outsourcing records project material issues and return receipts together', () => {
  assert.match(source, /OUTSOURCING_FACT_TYPES/u)
  assert.match(source, /MATERIAL_ISSUE: '委外发料'/u)
  assert.match(source, /RETURN_RECEIPT: '委外回货'/u)
  assert.match(source, /dataSource=\{orderFacts\}/u)
  assert.match(source, /委外记录/u)
  assert.match(source, /暂无委外记录/u)
  assert.doesNotMatch(source, /dataIndex:\s*'source_/u)
  assert.doesNotMatch(source, /dataIndex:\s*'idempotency_key'/u)
  assert.match(source, /title: '事实单号'/u)
  assert.match(source, /title: '业务类型'/u)
  assert.match(source, /title: '产品规格'/u)
  assert.match(source, /outsourcingFactProductSKUText\(fact\)/u)
  assert.doesNotMatch(source, /productSKUOption/u)
  assert.doesNotMatch(source, /productSKUs/u)
})

test('outsourcing fact lifecycle actions use the exact state matrix and inventory copy', () => {
  assert.match(source, /selectedStatus === 'DRAFT'/u)
  assert.match(source, /selectedStatus === 'POSTED'/u)
  assert.match(source, /selectedDraft && canPostFact/u)
  assert.match(source, /onPostFact\?\.\(selected\)/u)
  assert.match(source, /selectedDraft && canCancelFact/u)
  assert.match(source, /作废草稿（库存零变动）/u)
  assert.match(source, /selectedPosted && canCancelFact/u)
  assert.match(source, /取消过账（恢复至过账前库存）/u)
  assert.match(source, /onCancelFact\?\.\(selected\)/u)
  assert.match(source, /CANCELLED: '已取消'/u)
  assert.doesNotMatch(source, /selectedCancelled/u)
})

test('payable and quality actions fail closed on posted return receipt and accepted quality state', () => {
  assert.match(source, /isPostedReturnReceipt/u)
  assert.match(source, /selectedPostedReturn/u)
  assert.match(source, /canCreatePayable/u)
  assert.match(source, /canCreateQualityInspection/u)
  assert.match(source, /hasActiveQualityInspection/u)
  assert.match(source, /resolveOutsourcingReturnQualityGate/u)
  assert.match(source, /OUTSOURCING_RETURN_QUALITY_GATE_STATES\.ACCEPTED/u)
  assert.match(source, /selectedPayableEligible/u)
  assert.match(source, /title: '质检状态'/u)
  assert.match(source, /判定合格或让步接收后生成应付/u)
  assert.match(source, /生成应付/u)
  assert.match(source, /已发起质检/u)
  assert.match(source, /canViewQualityInspection/u)
  assert.match(source, /selectedQualityInspection/u)
  assert.match(source, /onViewQualityInspection/u)
  assert.match(source, /继续质检/u)
  assert.match(source, /只有已过账的委外回货可发起质检/u)
})
