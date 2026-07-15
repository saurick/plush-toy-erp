import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./V1OutsourcingOrdersPage.jsx', import.meta.url),
  'utf8'
)

test('outsourcing order source actions use exact capabilities and dedicated commands', () => {
  for (const permission of [
    'outsourcing.fact.read',
    'outsourcing.material_issue.create',
    'outsourcing.return_receipt.create',
  ]) {
    assert.match(source, new RegExp(permission.replaceAll('.', '\\.'), 'u'))
  }
  for (const command of [
    'createOutsourcingMaterialIssueFromOrder',
    'createOutsourcingReturnReceiptFromOrder',
  ]) {
    assert.match(source, new RegExp(command, 'u'))
  }
  assert.doesNotMatch(source, /createOutsourcingFact/u)
  assert.doesNotMatch(
    source,
    /purchase\.order\.update|warehouse\.adjustment\.create/u
  )
})

test('outsourcing order source actions stay on the matching confirmed open line', () => {
  assert.match(
    source,
    /OUTSOURCING_ORDER_SUBJECT_TYPES\.MATERIAL[\s\S]*OUTSOURCING_SOURCE_ACTIONS\.MATERIAL_ISSUE/u
  )
  assert.match(source, /OUTSOURCING_SOURCE_ACTIONS\.RETURN_RECEIPT/u)
  assert.match(source, /label: '委外发料'/u)
  assert.match(source, /label: '登记回货'/u)
  assert.match(source, /isOutsourcingSourceActionEligible/u)
  assert.match(source, /filterOutsourcingSourceActionLots/u)
})

test('outsourcing order source modal uses retry-safe attempts and clears closed context', () => {
  assert.match(source, /createSourceBusinessActionAttemptStore/u)
  assert.match(source, /sourceBusinessActionNo/u)
  assert.match(source, /sourceFactAttemptsRef\.current\.prepare/u)
  assert.match(source, /sourceFactAttemptsRef\.current\.settle/u)
  assert.match(source, /isSourceBusinessActionResultUnknown\(error\)/u)
  assert.match(source, /findOutsourcingSourceFactResult/u)
  assert.match(source, /委外业务生成结果仍无法确认/u)
  assert.match(source, /已重新读取并确认委外回货草稿/u)
  assert.match(source, /sourceFactRequestRef\.current \+= 1/u)
  assert.match(source, /setSourceFactContext\(EMPTY_SOURCE_FACT_CONTEXT\)/u)
  assert.match(source, /<OutsourcingOrderSourceFactModal/u)
  assert.match(source, /listAllProductSKUs/u)
  assert.doesNotMatch(source, /listProductSKUs\(\{ limit: 500 \}\)/u)
  assert.match(source, /listAllOutsourcingFacts\(\{/u)
  assert.doesNotMatch(
    source,
    /listOutsourcingFacts\([\s\S]{0,160}limit:\s*500/u
  )
  assert.match(source, /productSKUs=\{productSKUs\}/u)
  assert.match(source, /handleProductSKUChange/u)
  assert.match(source, /sku_code_snapshot/u)
})

test('outsourcing order source actions submit only source-owned form values', () => {
  const actionSource = source.slice(
    source.indexOf('const submitOutsourcingSourceFact'),
    source.indexOf('const processingPrintTemplateDefaults')
  )
  assert.match(actionSource, /buildOutsourcingSourceFactPayload/u)
  assert.match(actionSource, /customer_key: activeCustomerKey \|\| undefined/u)
  for (const forbiddenFormValue of [
    'fact_type',
    'subject_type',
    'subject_id',
    'supplier_id',
    'unit_id',
    'source_type',
    'source_id',
    'source_line_id',
  ]) {
    assert.doesNotMatch(
      actionSource,
      new RegExp(`values\\.${forbiddenFormValue}`, 'u')
    )
  }
})

test('posted outsourcing returns expose source-bound payable through related records', () => {
  assert.match(source, /相关回货记录/u)
  assert.match(source, /finance\.payable\.confirm/u)
  assert.match(source, /buildOutsourcingReturnPayablePayload\(values, fact\)/u)
  assert.match(source, /createPayableFromOutsourcingReturn\(attempt\.params\)/u)
  assert.match(source, /financeSourceAttemptsRef\.current\.prepare/u)
  assert.match(source, /financeSourceAttemptsRef\.current\.settle/u)
  assert.match(source, /source_type: 'OUTSOURCING_FACT'/u)
  assert.match(source, /resolveOutsourcingReturnQualityGate/u)
  assert.match(source, /OUTSOURCING_RETURN_QUALITY_GATE_STATES\.ACCEPTED/u)
  assert.match(source, /尚未完成合格或让步接收判定/u)
  assert.match(source, /质检不合格，请先完成返工、退回等质量处置/u)
  assert.match(source, /<OutsourcingReturnRecordsModal/u)
  assert.match(source, /<FinanceBusinessSourceModal/u)
})

test('posted outsourcing returns expose source-bound quality inspection', () => {
  assert.match(source, /quality\.inspection\.create/u)
  assert.match(source, /quality\.inspection\.read/u)
  assert.match(source, /createQualityInspectionFromOutsourcingReturn/u)
  assert.match(source, /listOutsourcingReturnQualityInspections/u)
  assert.match(source, /fact_id: fact\.id/u)
  assert.match(source, /limit: 200/u)
  assert.match(source, /buildOutsourcingReturnQualityInspectionPayload/u)
  assert.match(source, /isMatchingOutsourcingReturnQualityInspection/u)
  assert.match(source, /qualitySourceInFlightRef\.current/u)
  assert.match(source, /质检生成结果仍无法确认/u)
  assert.match(source, /setRelatedReturnFacts\(facts\)/u)
  assert.match(source, /setQualityInspectionByFactID/u)
  assert.match(source, /canCreateQualityInspection=/u)
  assert.match(source, /qualityInspectionByFactID=/u)
  assert.match(source, /<OutsourcingReturnQualityInspectionModal/u)
  assert.doesNotMatch(source, /createQualityInspectionDraft/u)
})

test('outsourcing return quality request only accepts source-owned business fields', () => {
  const actionSource = source.slice(
    source.indexOf('const submitOutsourcingReturnQualityInspection'),
    source.indexOf('const openOutsourcingReturnPayable')
  )
  assert.match(actionSource, /buildOutsourcingReturnQualityInspectionPayload/u)
  for (const forbiddenFormValue of [
    'source_type',
    'source_id',
    'inventory_lot_id',
    'warehouse_id',
    'subject_type',
    'subject_id',
    'idempotency_key',
  ]) {
    assert.doesNotMatch(
      actionSource,
      new RegExp(`values\\.${forbiddenFormValue}`, 'u')
    )
  }
})
