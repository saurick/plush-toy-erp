import assert from 'node:assert/strict'
import test from 'node:test'
import { readContractSource as readFileSync } from '../../../../scripts/test/publicContractSource.mjs'

const source = readFileSync(
  new URL('./OutsourcingReturnRecordsModal.jsx', import.meta.url),
  'utf8'
)

test('outsourcing record list exposes edit only for permitted DRAFT fact types', () => {
  assert.match(source, /canEditMaterialIssue/u)
  assert.match(source, /canEditReturnReceipt/u)
  assert.match(source, /selectedDraft/u)
  assert.match(source, /onEditFact\?\.\(selected\)/u)
  assert.match(source, /编辑草稿/u)
})

test('outsourcing records project material issues and return receipts together', () => {
  assert.match(source, /OUTSOURCING_FACT_TYPES/u)
  assert.match(source, /MATERIAL_ISSUE: '委外发料'/u)
  assert.match(source, /RETURN_RECEIPT: '委外回货'/u)
  assert.match(source, /dataSource=\{orderFacts\}/u)
  assert.match(source, /委外记录/u)
  assert.match(source, /暂无委外记录/u)
  assert.doesNotMatch(source, /dataIndex:\s*'source_/u)
  assert.doesNotMatch(source, /dataIndex:\s*'idempotency_key'/u)
  assert.match(source, /title: '业务单号'/u)
  assert.match(source, /title: '业务类型'/u)
  assert.match(source, /title: '产品规格'/u)
  assert.match(source, /outsourcingFactProductSKUText\(fact\)/u)
  assert.doesNotMatch(source, /productSKUOption/u)
  assert.doesNotMatch(source, /productSKUs/u)
})

test('outsourcing fact lifecycle actions use the exact state matrix and shared action copy', () => {
  assert.match(source, /selectedStatus === 'DRAFT'/u)
  assert.match(source, /selectedStatus === 'POSTED'/u)
  assert.match(source, /selectedDraft && canPostFact/u)
  assert.match(source, /onPostFact\?\.\(selected\)/u)
  assert.match(source, /cancelPresentation = operationalFactActionPresentation\('outsourcing', selected, 'cancel'\)/u)
  const cancelButtons = [...source.matchAll(
    /\{(selectedDraft|selectedPosted) && canCancelFact \? \(\s*(<Button\b[\s\S]*?<\/Button>)/gu
  )]
  assert.deepEqual(cancelButtons.map(([, state]) => state), ['selectedDraft', 'selectedPosted'])
  for (const [, , button] of cancelButtons) {
    assert.match(button, /onClick=\{\(\) => onCancelFact\?\.\(selected\)\}/u)
    assert.match(button, />\s*\{cancelPresentation\.label\}\s*<\/Button>/u)
  }
  assert.match(source, /'CANCELLED': '已取消'/u)
  assert.doesNotMatch(source, /selectedCancelled/u)
})

test('payable and quality actions fail closed on posted return receipt and accepted quality state', () => {
  assert.match(source, /isPostedReturnReceipt/u)
  assert.match(source, /selectedPostedReturn/u)
  assert.match(source, /canCreatePayable/u)
  assert.match(source, /canCreateQualityInspection/u)
  assert.match(source, /hasActiveQualityInspection/u)
  assert.match(source, /resolveOutsourcingReturnQualityGate/u)
  assert.match(source, /selectedPayableEligible =\s*selectedPostedReturn &&\s*selectedQualityGate\.state ===\s*OUTSOURCING_RETURN_QUALITY_GATE_STATES\.ACCEPTED/u)
  assert.match(source, /title: '质检状态'/u)
  assert.match(source, /判定合格或让步接收后才可生成应付/u)
  assert.match(source, /disabled=\{!selectedPayableEligible \|\| loading \|\| actionBusy\}[\s\S]*?onGeneratePayable\?\.\(selected\)/u)
  assert.match(source, /已发起质检/u)
  assert.match(source, /canViewQualityInspection/u)
  assert.match(source, /selectedQualityInspection/u)
  assert.match(source, /onViewQualityInspection/u)
  assert.match(source, /继续质检/u)
  assert.match(source, /disabled=\{\s*!selectedPostedReturn \|\|\s*hasActiveQualityInspection \|\|\s*loading \|\|\s*actionBusy\s*\}\s*onClick=\{\(\) => onCreateQualityInspection\?\.\(selected\)\}/u)
})
