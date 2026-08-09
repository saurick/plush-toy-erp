import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./OperationalFactsPage.jsx', import.meta.url)),
  'utf8'
)

test('production facts load the exact draft before opening the shared editor', () => {
  assert.match(source, /production-fact-edit-draft/u)
  assert.match(
    source,
    /listAllProductionFacts\(\{[\s\S]*keyword: String\(record\.id\)/u
  )
  assert.match(source, /fresh\.status !== 'DRAFT'/u)
  assert.match(source, /buildOperationalFactDraftSavePayload/u)
  assert.match(source, /expected_version/u)
  assert.match(source, /findOperationalFactDraftSaveResult/u)
  assert.match(source, /mode="edit"/u)
})

test('finance cancellation requires a bounded business reason and sends it to the canonical action', () => {
  assert.match(source, /'作废财务草稿'/)
  assert.match(source, /'取消财务记录'/)
  assert.match(
    source,
    /currentActiveKey === 'finance'[\s\S]*\? '请填写客户、供应商或账款调整的业务原因'[\s\S]*: '请填写作废或取消的业务原因'/u
  )
  assert.match(source, /maxLength=\{255\}/)
  assert.match(source, /\{ reason \}/)
  assert.match(source, /currentActiveKey === 'finance'/)
  assert.match(source, /\['production', 'outsourcing'\]\.includes/)
  assert.match(source, /canConfirmFinanceFact\(adminProfile/)
})

test('draft facts can exit without pretending an inventory reversal happened', () => {
  assert.match(
    source,
    /\['DRAFT', 'POSTED'\]\.includes\(activeSelectedRow\.status\)/u
  )
  assert.match(source, /草稿尚未过账，不会变更库存/u)
  assert.match(source, /草稿尚未确认，作废不会生成过账或库存变更/u)
  assert.match(
    source,
    /const cancelButtonLabel\s*=\s*[\s\S]{0,100}activeSelectedRow\?\.status === 'DRAFT' \? '作废草稿' : '取消'/u
  )
  assert.match(source, />\s*\{cancelButtonLabel\}\s*</u)
})

test('finance draft actions fail closed when a historical row lacks a formal source', () => {
  assert.match(source, /hasValidFinanceTransitionSource/u)
  assert.match(
    source,
    /const financeDraftTransitionBlocked\s*=\s*[\s\S]*activeSelectedRow\?\.status === 'DRAFT'[\s\S]*!hasValidFinanceTransitionSource\(activeSelectedRow\)/u
  )
  assert.match(source, /该历史草稿缺少可核对来源，不能确认或作废/u)
  assert.ok(
    (source.match(/financeDraftTransitionBlocked \|\|/gu)?.length || 0) >= 4,
    'finance confirm and draft cancellation must share the same source guard in the tooltip and button'
  )
})

test('production and outsourcing historical drafts fail closed without source coordinates', () => {
  assert.match(source, /hasRequiredOperationalFactDraftSource/u)
  assert.match(
    source,
    /const sourceBoundDraftTransitionBlocked\s*=\s*[\s\S]*\['production', 'outsourcing'\]\.includes\(currentActiveKey\)[\s\S]*hasRequiredOperationalFactDraftSource/u
  )
  assert.match(source, /该历史草稿缺少可核对来源，不能过账或作废/u)
  assert.ok(
    (source.match(/sourceBoundDraftTransitionBlocked \|\|/gu)?.length || 0) >=
      4,
    'post and draft cancellation must share the same source guard in the tooltip and button'
  )
})

test('shipment drafts can be voided without claiming an inventory reversal', () => {
  assert.match(source, /确认作废出货草稿？草稿尚未出库，不会变更库存/u)
  assert.match(
    source,
    /\['DRAFT', 'SHIPPED'\]\.includes\(activeSelectedRow\.status\)/u
  )
  assert.match(
    source,
    /activeSelectedRow\?\.status === 'DRAFT'[\s\S]{0,100}'作废出货草稿'/u
  )
})

test('finance page derives projection, permission and settlement from the filtered fact type', () => {
  assert.match(
    source,
    /const activeFinanceFactType = activeConfig\.listParams\?\.fact_type/u
  )
  assert.match(
    source,
    /buildOperationalFactColumns\(currentActiveKey, activeFinanceFactType\)/u
  )
  assert.match(source, /financeSettlementActionFor\(/u)
  assert.match(source, /financeSettlementAction\.confirmTitle/u)
  assert.match(source, /financeSettlementAction\.label/u)
  assert.match(
    source,
    /currentActiveKey === 'finance'[\s\S]*runRowAction\(activeConfig, activeSelectedRow, 'post', '确认'\)/u
  )
  assert.doesNotMatch(source, /确认结清当前财务记录/u)
  assert.doesNotMatch(source, /activeConfig\.initialValues/u)
})

test('post-success refresh failure is not reported as a failed cancellation', () => {
  assert.match(source, /已完成，请稍后刷新查看最新结果/)
  assert.match(source, /return false/)
  assert.match(source, /return true/)
})

test('only posted rework feedback explains the atomic exception handoff', () => {
  assert.match(
    source,
    /currentActiveKey === 'production'[\s\S]{0,180}actionKey === 'post'[\s\S]{0,180}row\.fact_type[\s\S]{0,180}'REWORK'/u
  )
  assert.match(source, /返工记录已过账，返工补制批次和生产异常任务已生成/u)
  assert.doesNotMatch(source, /发起生产异常/u)
})

test('production and outsourcing source links constrain the destination list', () => {
  assert.match(
    source,
    /\['production', 'outsourcing'\]\.includes\(key\)[\s\S]*source_type: routeSourceType,[\s\S]*source_id: routeSourceID/u
  )
})

test('unified fact page keeps outsourcing payable read-only without a quality projection', () => {
  assert.match(source, /finance\.payable\.read/u)
  assert.match(source, /finance\.reconciliation\.confirm/u)
  assert.match(source, /isOutsourcingReturnPayableSource\(activeSelectedRow\)/u)
  assert.match(source, /isSingleFactReconciliationSource\(activeSelectedRow\)/u)
  assert.match(source, />\s*查看应付\s*</u)
  assert.doesNotMatch(source, /createPayableFromOutsourcingReturn/u)
  assert.doesNotMatch(source, /OUTSOURCING_RETURN_PAYABLE/u)
  assert.doesNotMatch(source, />\s*生成应付\s*</u)
})

test('single reconciliation uses exact permission and retains unknown attempts', () => {
  assert.match(source, /finance\.reconciliation\.confirm/u)
  assert.match(source, /isSingleFactReconciliationSource\(activeSelectedRow\)/u)
  assert.match(source, /createReconciliationFromFinanceFact/u)
  assert.match(source, /financeSourceAttemptsRef\.current\.settle/u)
  assert.match(source, /单笔核对/u)
  assert.doesNotMatch(source, /SINGLE_FACT_RECONCILIATION[\s\S]{0,240}PAYMENT/u)
})

test('posted production completions expose an exact-permission rework action', () => {
  assert.match(
    source,
    /hasActionPermission\([\s\S]{0,100}'production\.rework\.create'/u
  )
  assert.match(
    source,
    /currentActiveKey === 'production'[\s\S]{0,160}canCreateProductionRework/u
  )
  assert.match(
    source,
    /isProductionReworkEligible\(activeSelectedRow, activeRows\)/u
  )
  assert.match(source, />\s*发起返工\s*</u)
  assert.doesNotMatch(source, /canCreateProductionRework\s*=\s*canPostActive/u)
  assert.doesNotMatch(
    source,
    /canCreateProductionRework\s*=\s*canCancelActive/u
  )
})

test('production rework uses a source-bound retry-safe command and rereads unknown results', () => {
  assert.match(source, /buildProductionReworkPayload\(values, source, facts\)/u)
  assert.match(
    source,
    /productionReworkAttemptsRef\.current\.prepare\(scope, payload\)/u
  )
  assert.match(
    source,
    /createProductionReworkFromCompletion\(attempt\.params\)/u
  )
  assert.match(source, /isSourceBusinessActionResultUnknown\(error\)/u)
  assert.match(
    source,
    /source_type: 'PRODUCTION_FACT',[\s\S]{0,100}source_id: source\.id/u
  )
  assert.match(
    source,
    /findProductionReworkResult\(currentFacts, attempt\.params\)/u
  )
  assert.match(source, /已重新读取并确认返工草稿，请核对后过账/u)
  assert.match(source, /setProductionReworkContext\(null\)/u)
  assert.match(source, /<ProductionReworkModal/u)
})

test('posted rework records open authoritative progress and link back to the production order', () => {
  assert.match(source, /ProductionReworkProgressModal/u)
  assert.match(source, /'production\.wip\.read'/u)
  assert.match(source, /selectedCanViewProductionReworkProgress/u)
  assert.match(source, /getProductionWip\(orderID\)/u)
  assert.match(source, /origin_rework_fact_id/u)
  assert.match(source, /focusReworkFactID:\s*source\.id/u)
  assert.match(source, />\s*查看返工进度\s*</u)
  assert.match(source, /V1_ROUTE_PATHS\.productionOrders/u)
  assert.match(source, /production_order_id:\s*orderID/u)
  assert.match(source, /该返工记录尚未关联可核对的成品返工补制批次/u)
})

test('operational fact actions keep a stable authorized catalog across selection and status changes', () => {
  for (const actionKey of [
    'related-records',
    'operational-fact-details',
    'operational-fact-post',
    'production-rework-start',
    'production-rework-progress',
    'finance-fact-confirm',
    'finance-single-reconciliation',
    'finance-fact-cancel',
    'outsourcing-contract-print',
    'outsourcing-payable',
    'shipment-post',
    'reservation-release',
    'finance-reconciliation-settle',
    'operational-fact-cancel',
    'shipment-cancel',
  ]) {
    assert.match(
      source,
      new RegExp(`data-business-action-key="${actionKey}"`, 'u'),
      `${actionKey} must keep a stable action slot`
    )
  }

  assert.doesNotMatch(source, /canPostActive\s*&&\s*\(!activeSelectedRow/u)
  assert.doesNotMatch(
    source,
    /canCreateProductionRework\s*&&\s*\(!activeSelectedRow/u
  )
  assert.doesNotMatch(
    source,
    /canCreateSingleReconciliation\s*&&\s*\(!activeSelectedRow/u
  )
  assert.doesNotMatch(
    source,
    /canViewOutsourcingPayable\s*&&\s*\(!activeSelectedRow/u
  )
  assert.doesNotMatch(source, /selectedIsProductionReworkCandidate/u)
  assert.doesNotMatch(source, /selectedIsSingleReconciliationCandidate/u)
  assert.doesNotMatch(source, /selectedIsOutsourcingPayableCandidate/u)
})

test('related-record menu keeps permission-scoped slots and disables unavailable record links', () => {
  assert.match(source, /const availableRelatedMenuItems = useMemo/u)
  assert.match(source, /const relatedMenuItems = useMemo/u)
  assert.match(source, /disabled: !available/u)
  assert.match(
    source,
    /const hasRelatedCapability = relatedMenuItems\.length > 0/u
  )
  assert.match(source, /\{hasRelatedCapability \? \(/u)
  assert.doesNotMatch(source, /\{relatedActionAvailability\.visible \? \(/u)
})
