import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./V1OutsourcingOrdersPage.jsx', import.meta.url),
  'utf8'
)
const formSource = readFileSync(
  new URL(
    '../components/outsourcing-orders/OutsourcingOrderForm.jsx',
    import.meta.url
  ),
  'utf8'
)
const orderViewSource = readFileSync(
  new URL('../utils/masterDataOrderView.mjs', import.meta.url),
  'utf8'
)

test('outsourcing page has no retired sales-order foreign-key field', () => {
  assert.doesNotMatch(formSource, /source_sales_order_id/u)
  assert.doesNotMatch(orderViewSource, /source_sales_order_id/u)
})

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
  assert.match(source, /sourceAction && view === 'details'/u)
  assert.doesNotMatch(source, /sourceAction && view !== 'preview'/u)
  assert.doesNotMatch(source, /sourceAction && view === 'modal'/u)
})

test('outsourcing page explains follow-up work in business language', () => {
  assert.match(source, /发料、质检、应付分开办理/u)
  assert.match(
    source,
    /确认下单只确认加工合同，不会同时完成发料、回货、质检或应付/u
  )
  assert.doesNotMatch(source, /不直接写质检 \/ 库存 \/ 应付/u)
})

test('outsourcing order source modal uses retry-safe attempts and clears closed context', () => {
  assert.match(source, /createSourceBusinessActionAttemptStore/u)
  assert.match(source, /sourceBusinessActionNo/u)
  assert.match(source, /sourceFactAttemptsRef\.current\.prepare/u)
  assert.match(source, /sourceFactAttemptsRef\.current\.settle/u)
  assert.match(source, /isSourceBusinessActionResultUnknown\(error\)/u)
  assert.match(source, /findOutsourcingSourceFactResult/u)
  assert.match(source, /保持内容不变后重试，避免重复记录/u)
  assert.match(
    source,
    /已重新读取并确认委外回货草稿，可在委外记录中继续办理/u
  )
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

test('outsourcing page delegates complete paginated datasets to listAll contracts', () => {
  for (const functionName of [
    'listAllSuppliers',
    'listAllProducts',
    'listAllProductSKUs',
    'listAllMaterials',
    'listAllProcesses',
    'listAllUnits',
    'listAllWarehouses',
    'listAllContactsByOwner',
    'listAllOutsourcingOrderItems',
    'listAllOutsourcingFacts',
    'listAllInventoryLots',
    'listAllOutsourcingReturnQualityInspections',
  ]) {
    assert.match(source, new RegExp(`\\b${functionName}\\s*\\(`, 'u'))
  }

  for (const singlePageFunctionName of [
    'listSuppliers',
    'listProducts',
    'listProductSKUs',
    'listMaterials',
    'listProcesses',
    'listUnits',
    'listWarehouses',
    'listContactsByOwner',
    'listOutsourcingOrderItems',
    'listOutsourcingFacts',
    'listInventoryLots',
    'listOutsourcingReturnQualityInspections',
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${singlePageFunctionName}\\s*\\(`, 'u')
    )
  }
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
  assert.match(source, />\s*委外记录\s*</u)
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

test('outsourcing record lifecycle uses exact permissions, canonical commands, and write-then-reread confirmation', () => {
  for (const permission of [
    'outsourcing.fact.post',
    'outsourcing.fact.cancel',
  ]) {
    assert.match(source, new RegExp(permission.replaceAll('.', '\\.'), 'u'))
  }
  assert.match(source, /postOutsourcingFact/u)
  assert.match(source, /cancelOutsourcingFact/u)
  assert.match(source, /const mutateOutsourcingFact/u)
  assert.match(source, /isSourceBusinessActionResultUnknown\(error\)/u)
  assert.match(
    source,
    /currentFacts = await loadRelatedOutsourcingFacts\([\s\S]*setRelatedReturnFacts\(currentFacts\)/u
  )
  assert.match(source, /isMatchingOutsourcingFactState/u)
  assert.match(source, /写入后重新读取仍未确认目标状态/u)
  assert.match(source, /作废不会产生任何库存变动/u)
  assert.match(source, /库存已恢复至过账前状态/u)
  assert.match(source, /canPostFact=\{canPostOutsourcingFact\}/u)
  assert.match(source, /canCancelFact=\{canCancelOutsourcingFact\}/u)
  assert.match(source, /onPostFact=\{postSelectedOutsourcingFact\}/u)
  assert.match(source, /onCancelFact=\{cancelSelectedOutsourcingFact\}/u)
})

test('posted outsourcing returns expose source-bound quality inspection', () => {
  assert.match(source, /quality\.inspection\.create/u)
  assert.match(source, /quality\.inspection\.read/u)
  assert.match(source, /createQualityInspectionFromOutsourcingReturn/u)
  assert.match(source, /listAllOutsourcingReturnQualityInspections/u)
  assert.doesNotMatch(
    source,
    /\blistOutsourcingReturnQualityInspections\s*\(/u
  )
  assert.match(source, /fact_id: fact\.id/u)
  assert.match(source, /buildOutsourcingReturnQualityInspectionPayload/u)
  assert.match(source, /isMatchingOutsourcingReturnQualityInspection/u)
  assert.match(source, /qualitySourceInFlightRef\.current/u)
  assert.match(source, /质检生成结果仍无法确认/u)
  assert.match(source, /setRelatedReturnFacts\(facts\)/u)
  assert.match(source, /setQualityInspectionByFactID/u)
  assert.match(source, /canCreateQualityInspection=/u)
  assert.match(source, /canViewQualityInspection=/u)
  assert.match(source, /qualityInspectionByFactID=/u)
  assert.match(source, /viewOutsourcingReturnQualityInspection/u)
  assert.match(source, /quality_inspection_id: inspection\.id/u)
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

test('resolved related contract number is isolated by the exact route key', () => {
  assert.match(
    source,
    /const linkedRouteKey = `\$\{routeOutsourcingOrderID\}:\$\{routeOutsourcingFactID\}`/u
  )
  assert.match(
    source,
    /resolvedLinkedContext\.routeKey === linkedRouteKey/u
  )
  assert.match(
    source,
    /setResolvedLinkedContext\(\{ routeKey: requestRouteKey, keyword: '' \}\)/u
  )
})
