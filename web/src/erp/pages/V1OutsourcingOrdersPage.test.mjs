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
  new URL('../utils/sourceOrderParams.mjs', import.meta.url),
  'utf8'
)

const sourceFactActions = readFileSync(
  new URL(
    '../components/outsourcing-orders/useOutsourcingSourceFacts.jsx',
    import.meta.url
  ),
  'utf8'
)
const payableAction = readFileSync(
  new URL(
    '../components/outsourcing-orders/useOutsourcingReturnPayable.mjs',
    import.meta.url
  ),
  'utf8'
)

const editor = readFileSync(
  new URL(
    '../components/outsourcing-orders/useOutsourcingOrderEditor.mjs',
    import.meta.url
  ),
  'utf8'
)

const query = readFileSync(
  new URL(
    '../components/outsourcing-orders/useOutsourcingOrderQuery.mjs',
    import.meta.url
  ),
  'utf8'
)

const lifecycle = readFileSync(
  new URL(
    '../components/outsourcing-orders/useOutsourcingOrderLifecycle.jsx',
    import.meta.url
  ),
  'utf8'
)

test('outsourcing records reopen exact DRAFT facts in the shared source modal', () => {
  assert.match(source, /openOutsourcingFactDraftEditor/u)
  assert.match(sourceFactActions, /keyword: String\(fact\.id\)/u)
  assert.match(sourceFactActions, /fresh\.status !== 'DRAFT'/u)
  assert.match(sourceFactActions, /mode: 'edit'/u)
  assert.match(sourceFactActions, /buildOperationalFactDraftSavePayload/u)
  assert.match(sourceFactActions, /saveOutsourcingMaterialIssueDraft/u)
  assert.match(sourceFactActions, /saveOutsourcingReturnReceiptDraft/u)
  assert.match(sourceFactActions, /findOperationalFactDraftSaveResult/u)
})

test('outsourcing page has no retired sales-order foreign-key field', () => {
  assert.doesNotMatch(formSource, /source_sales_order_id/u)
  assert.doesNotMatch(orderViewSource, /source_sales_order_id/u)
})

test('outsourcing contract keeps editable party B snapshot and checks it before lifecycle or print', () => {
  assert.match(editor, /supplier_types: \['outsourcing', 'mixed'\]/u)
  assert.match(editor, /buildOutsourcingSupplierSnapshot/u)
  assert.match(editor, /loadSupplierContacts/u)
  assert.match(formSource, /合同乙方信息/u)
  assert.match(formSource, /乙方联系人/u)
  assert.match(formSource, /乙方签约人/u)
  assert.match(source, /inspectOutsourcingContractReadiness/u)
  assert.match(lifecycle, /buildOutsourcingContractConfirmationSummary/u)
  assert.match(source, /loadBusinessAttachmentPrintAppendixSnapshots/u)
  assert.doesNotMatch(source, /mergeSnapshotMissingFields/u)
})

test('outsourcing order source actions use exact capabilities and dedicated commands', () => {
  for (const permission of [
    'outsourcing.material_issue.create',
    'outsourcing.return_receipt.create',
  ]) {
    assert.match(source, new RegExp(permission.replaceAll('.', '\\.'), 'u'))
  }
  assert.match(query, /'outsourcing\.fact\.read'/u)
  for (const command of [
    'createOutsourcingMaterialIssueFromOrder',
    'createOutsourcingReturnReceiptFromOrder',
  ]) {
    assert.match(sourceFactActions, new RegExp(command, 'u'))
  }
  assert.doesNotMatch(source, /createOutsourcingFact/u)
  assert.doesNotMatch(
    source,
    /purchase\.order\.update|warehouse\.adjustment\.create/u
  )
})

test('outsourcing order source actions stay on the matching confirmed open line', () => {
  assert.match(
    sourceFactActions,
    /OUTSOURCING_ORDER_SUBJECT_TYPES\.MATERIAL[\s\S]*OUTSOURCING_SOURCE_ACTIONS\.MATERIAL_ISSUE/u
  )
  assert.match(sourceFactActions, /OUTSOURCING_SOURCE_ACTIONS\.RETURN_RECEIPT/u)
  assert.match(sourceFactActions, /label: '委外发料'/u)
  assert.match(sourceFactActions, /label: '登记回货'/u)
  assert.match(sourceFactActions, /isOutsourcingSourceActionEligible/u)
  assert.match(sourceFactActions, /filterOutsourcingSourceActionLots/u)
  assert.match(sourceFactActions, /sourceAction && view === 'details'/u)
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
  assert.match(sourceFactActions, /createSourceBusinessActionAttemptStore/u)
  assert.match(sourceFactActions, /sourceBusinessActionNo/u)
  assert.match(sourceFactActions, /sourceFactAttemptsRef\.current\.prepare/u)
  assert.match(sourceFactActions, /sourceFactAttemptsRef\.current\.settle/u)
  assert.match(
    sourceFactActions,
    /isSourceBusinessActionResultUnknown\(error\)/u
  )
  assert.match(sourceFactActions, /findOutsourcingSourceFactResult/u)
  assert.match(sourceFactActions, /保持内容不变后重试，避免重复记录/u)
  assert.match(
    sourceFactActions,
    /已重新读取并确认委外回货草稿，可在委外记录中继续办理/u
  )
  assert.match(sourceFactActions, /sourceFactRequestRef\.current \+= 1/u)
  assert.match(
    sourceFactActions,
    /setSourceFactContext\(EMPTY_SOURCE_FACT_CONTEXT\)/u
  )
  assert.match(source, /<OutsourcingOrderSourceFactModal/u)
  assert.match(editor, /listAllProductSKUs/u)
  assert.doesNotMatch(editor, /listProductSKUs\(\{ limit: 500 \}\)/u)
  assert.match(sourceFactActions, /listAllOutsourcingFacts\(\{/u)
  assert.doesNotMatch(
    source,
    /listOutsourcingFacts\([\s\S]{0,160}limit:\s*500/u
  )
  assert.match(source, /productSKUs=\{productSKUs\}/u)
  assert.match(source, /handleProductSKUChange/u)
  assert.match(editor, /sku_code_snapshot/u)
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
  ]) {
    assert.match(editor, new RegExp(`\\b${functionName}\\s*\\(`, 'u'))
  }

  for (const functionName of [
    'listAllOutsourcingOrderItems',
    'listAllOutsourcingFacts',
    'listAllInventoryLots',
    'listAllOutsourcingReturnQualityInspections',
  ]) {
    assert.match(
      sourceFactActions,
      new RegExp(`\\b${functionName}\\s*\\(`, 'u')
    )
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
      editor,
      new RegExp(`\\b${singlePageFunctionName}\\s*\\(`, 'u')
    )
    assert.doesNotMatch(
      sourceFactActions,
      new RegExp(`\\b${singlePageFunctionName}\\s*\\(`, 'u')
    )
  }
})

test('outsourcing order source actions submit only source-owned form values', () => {
  const actionSource = sourceFactActions.slice(
    sourceFactActions.indexOf('const submitOutsourcingSourceFact'),
    sourceFactActions.lastIndexOf('return {')
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
  assert.match(
    payableAction,
    /buildOutsourcingReturnPayablePayload\(values, fact\)/u
  )
  assert.match(
    payableAction,
    /createPayableFromOutsourcingReturn\(attempt\.params\)/u
  )
  assert.match(payableAction, /financeSourceAttemptsRef\.current\.prepare/u)
  assert.match(payableAction, /financeSourceAttemptsRef\.current\.settle/u)
  assert.match(payableAction, /source_type: 'OUTSOURCING_FACT'/u)
  assert.match(payableAction, /resolveOutsourcingReturnQualityGate/u)
  assert.match(
    payableAction,
    /OUTSOURCING_RETURN_QUALITY_GATE_STATES\.ACCEPTED/u
  )
  assert.match(payableAction, /尚未完成合格或让步接收判定/u)
  assert.match(payableAction, /质检不合格，请先完成返工、退回等质量处置/u)
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
  assert.match(sourceFactActions, /postOutsourcingFact/u)
  assert.match(sourceFactActions, /cancelOutsourcingFact/u)
  assert.match(sourceFactActions, /const mutateOutsourcingFact/u)
  assert.match(
    sourceFactActions,
    /isSourceBusinessActionResultUnknown\(error\)/u
  )
  assert.match(
    sourceFactActions,
    /currentFacts = await loadRelatedOutsourcingFacts\([\s\S]*setRelatedReturnFacts\(currentFacts\)/u
  )
  assert.match(sourceFactActions, /matchesOperationalFactLifecycleResult/u)
  assert.match(sourceFactActions, /expected_version: fact\?\.version/u)
  assert.match(
    sourceFactActions,
    /\.\.\.\(!isPost \? \{ reason: String\(reason \|\| ''\)\.trim\(\) \} : \{\}\)/u
  )
  assert.match(sourceFactActions, /写入后重新读取仍未确认目标状态/u)
  assert.match(sourceFactActions, /作废不会产生任何库存变动/u)
  assert.match(sourceFactActions, /库存已恢复至过账前状态/u)
  assert.match(source, /canPostFact=\{canPostOutsourcingFact\}/u)
  assert.match(source, /canCancelFact=\{canCancelOutsourcingFact\}/u)
  assert.match(source, /onPostFact=\{postSelectedOutsourcingFact\}/u)
  assert.match(source, /onCancelFact=\{cancelSelectedOutsourcingFact\}/u)
  assert.match(
    sourceFactActions,
    /onOk: \(_close\) => \{\s+const reason = cancelReason\.trim\(\)/u
  )
  assert.doesNotMatch(source, /return Promise\.reject\(\)/u)
})

test('posted outsourcing returns expose source-bound quality inspection', () => {
  assert.match(source, /quality\.inspection\.create/u)
  assert.match(source, /quality\.inspection\.read/u)
  assert.match(
    sourceFactActions,
    /createQualityInspectionFromOutsourcingReturn/u
  )
  assert.match(sourceFactActions, /listAllOutsourcingReturnQualityInspections/u)
  assert.doesNotMatch(source, /\blistOutsourcingReturnQualityInspections\s*\(/u)
  assert.match(sourceFactActions, /fact_id: fact\.id/u)
  assert.match(
    sourceFactActions,
    /buildOutsourcingReturnQualityInspectionPayload/u
  )
  assert.match(
    sourceFactActions,
    /isMatchingOutsourcingReturnQualityInspection/u
  )
  assert.match(sourceFactActions, /qualitySourceInFlightRef\.current/u)
  assert.match(sourceFactActions, /质检生成结果仍无法确认/u)
  assert.match(sourceFactActions, /setRelatedReturnFacts\(facts\)/u)
  assert.match(sourceFactActions, /setQualityInspectionByFactID/u)
  assert.match(source, /canCreateQualityInspection=/u)
  assert.match(source, /canViewQualityInspection=/u)
  assert.match(source, /qualityInspectionByFactID=/u)
  assert.match(source, /viewOutsourcingReturnQualityInspection/u)
  assert.match(sourceFactActions, /quality_inspection_id: inspection\.id/u)
  assert.match(source, /<OutsourcingReturnQualityInspectionModal/u)
  assert.doesNotMatch(source, /createQualityInspectionDraft/u)
})

test('outsourcing return quality request only accepts source-owned business fields', () => {
  const actionSource = sourceFactActions.slice(
    sourceFactActions.indexOf('const submitOutsourcingReturnQualityInspection'),
    sourceFactActions.indexOf('const viewOutsourcingReturnQualityInspection')
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
    query,
    /const linkedRouteKey = `\$\{routeOutsourcingOrderID\}:\$\{routeOutsourcingFactID\}`/u
  )
  assert.match(query, /resolvedLinkedContext\.routeKey === linkedRouteKey/u)
  assert.match(
    query,
    /setResolvedLinkedContext\(\{ routeKey: requestRouteKey, keyword: '' \}\)/u
  )
})

test('outsourcing selection actions keep one authorized catalog across record states', () => {
  const actionBarSource = source.slice(
    source.indexOf('<SelectionActionBar'),
    source.indexOf('</SelectionActionBar>')
  )
  for (const actionKey of [
    'outsourcing-edit',
    'related-outsourcing-facts',
    'processing-contract-print',
    'work-instruction-print',
  ]) {
    assert.match(
      source,
      new RegExp(`data-business-action-key="${actionKey}"`, 'u')
    )
  }
  assert.match(source, /actionStates: lifecycleActionStates/u)
  assert.match(source, /actionStates=\{lifecycleActionStates\}/u)
  assert.match(source, /disabled=\{primaryLifecycleState\.disabled\}/u)
  assert.doesNotMatch(
    actionBarSource,
    /canUpdate\s*&&[\s\S]{0,100}canEditOutsourcingOrder/u
  )
})
