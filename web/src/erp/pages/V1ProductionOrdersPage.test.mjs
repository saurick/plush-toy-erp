import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(
  new URL('./V1ProductionOrdersPage.jsx', import.meta.url),
  'utf8'
)
const form = readFileSync(
  new URL(
    '../components/production-orders/ProductionOrderFormModal.jsx',
    import.meta.url
  ),
  'utf8'
)
const completionModal = readFileSync(
  new URL(
    '../components/production-orders/ProductionCompletionModal.jsx',
    import.meta.url
  ),
  'utf8'
)
const materialIssueModal = readFileSync(
  new URL(
    '../components/production-orders/ProductionMaterialIssueModal.jsx',
    import.meta.url
  ),
  'utf8'
)
const materialIssueAction = readFileSync(
  new URL('../utils/productionMaterialIssueAction.mjs', import.meta.url),
  'utf8'
)
const completionAction = readFileSync(
  new URL('../utils/productionCompletionAction.mjs', import.meta.url),
  'utf8'
)
const router = readFileSync(new URL('../router.jsx', import.meta.url), 'utf8')

test('production order page is an independent Source Document route', () => {
  assert.match(router, /path="production\/orders"/u)
  assert.match(router, /V1ProductionOrdersPage/u)
  assert.match(page, /生产计划单/u)
  assert.doesNotMatch(
    page,
    /createProductionFact|postProductionFact|WorkflowTask/u
  )
})

test('production order page hides technical identity and uses readable remote references', () => {
  assert.match(form, /ProductionOrderReferenceSelect/u)
  assert.match(form, /sales_order_item/u)
  assert.match(form, /active_bom/u)
  for (const forbiddenCopy of [
    'product_id',
    'product_sku_id',
    'unit_id',
    'sales_order_item_id',
    'bom_header_id',
    'expected_version',
    'idempotency_key',
  ]) {
    assert.equal(page.includes(`>${forbiddenCopy}<`), false)
    assert.equal(form.includes(`>${forbiddenCopy}<`), false)
    assert.equal(completionModal.includes(`>${forbiddenCopy}<`), false)
    assert.equal(materialIssueModal.includes(`>${forbiddenCopy}<`), false)
  }
})

test('production order lifecycle keeps backend authority and separates refresh errors', () => {
  assert.match(page, /生产数量尚未全部完成/u)
  assert.match(page, /已有生效生产记录的订单不能直接取消/u)
  assert.match(page, /isProductionOrderResultUnknown/u)
  assert.match(page, /操作已成功，但列表刷新失败/u)
  assert.match(page, /getActionErrorMessage/u)
})

test('production order release explains the atomic scheduling handoff', () => {
  assert.match(page, /生产订单已发布，排程任务已进入 PMC 待办/u)
})

test('production order forms initialize only after their modal is mounted', () => {
  assert.equal(page.match(/form\.setFieldsValue/gu)?.length, 1)
  assert.equal(page.match(/reasonForm\.resetFields/gu)?.length, 1)
  assert.match(page, /if \(!formMode \|\| !formValues\) return/u)
  assert.match(page, /if \(!reasonAction\) return/u)
})

test('released production orders create a source-bound completion draft', () => {
  assert.match(page, /'production\.completion\.create'/u)
  assert.match(page, /selected\.status !== PRODUCTION_ORDER_STATUS\.RELEASED/u)
  assert.match(page, /createProductionCompletionFromOrder\(params\)/u)
  assert.match(page, /source_type: 'PRODUCTION_ORDER'/u)
  assert.match(page, /listProductionFacts/u)
  assert.match(page, /listWarehouses\(\{ active_only: true, limit: 500 \}\)/u)
  assert.match(page, /listInventoryLots\(\{ status: 'ACTIVE', limit: 500 \}\)/u)
  assert.match(page, /sourceBusinessActionNo/u)
  assert.match(page, /validateProductionCompletionResult/u)
  assert.match(page, /完工记录草稿已生成，请到生产记录核对并过账/u)
  assert.doesNotMatch(page, /postProductionFact/u)
})

test('released production orders expose route execution through separate permissions', () => {
  assert.match(page, /ProductionRouteExecutionModal/u)
  for (const permission of [
    'production.wip.read',
    'production.wip.assign',
    'production.wip.execute',
    'production.wip.rework',
    'production.packaging_material.confirm',
    'outsourcing.order.read',
  ]) {
    assert.match(page, new RegExp(`['"]${permission}['"]`, 'u'))
  }
  assert.match(
    page,
    /canAssign=\{canAssignProductionWip\}[\s\S]*canExecute=\{canExecuteProductionWip\}[\s\S]*canRework=\{canReworkProductionWip\}[\s\S]*canConfirmPackaging=\{canConfirmPackagingMaterial\}[\s\S]*canReadOutsourcingContracts=\{canReadOutsourcingContracts\}/u
  )
  assert.match(
    page,
    /selected\?\.status === PRODUCTION_ORDER_STATUS\.RELEASED/u
  )
  assert.match(page, />\s*工序办理\s*</u)
})

test('WIP readers can open production orders without receiving PMC write permissions', () => {
  assert.match(
    page,
    /const canRead =\s*hasActionPermission\(adminProfile, 'pmc\.plan\.read'\) \|\| canReadProductionWip/u
  )
  assert.match(
    page,
    /const canCreate = hasActionPermission\(adminProfile, 'pmc\.plan\.create'\)/u
  )
  assert.match(
    page,
    /const canUpdate = hasActionPermission\(adminProfile, 'pmc\.plan\.update'\)/u
  )
})

test('routed completion fails closed until packaging is accepted and packaging material is confirmed', () => {
  assert.match(page, /partitionProductionCompletionItems/u)
  assert.match(page, /productionWipCompletionEligibility/u)
  assert.match(page, /hasRoutedItem \? getProductionWip\(orderID\)/u)
  assert.match(page, /eligibleItems\.length === 0/u)
  assert.match(page, /暂不能登记完工入库/u)
  assert.match(page, /工序状态已变化/u)
  assert.match(page, /当前账号没有查看生产工序的权限/u)
  assert.match(completionModal, /部分路线明细暂不可登记/u)
})

test('production page explains fixed sewing-before-handwork and layered facts', () => {
  assert.match(page, /布料加工、车缝、手工、包装依次办理/u)
  assert.match(page, /先车缝、后手工/u)
  assert.match(page, /工序完工、品质判定与最终完工入库分层办理/u)
})

test('production completion keeps unknown attempts and links to filtered records', () => {
  assert.match(page, /createSourceBusinessActionAttemptStore/u)
  assert.match(page, /isSourceBusinessActionResultUnknown\(error\)/u)
  assert.match(page, /findProductionCompletionResult/u)
  assert.match(
    page,
    /refreshProductionSources\(completionContext\.order\.id\)/u
  )
  assert.match(page, /setCompletionContext\(EMPTY_COMPLETION_CONTEXT\)/u)
  assert.match(
    page,
    /暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录/u
  )
  assert.match(page, /V1_ROUTE_PATHS\.productionProgress/u)
  assert.match(page, /source_id: order\.id/u)
  assert.match(completionModal, /disabled=\{loading\}/u)
})

test('production completion submits exactly one inbound lot intent', () => {
  assert.match(completionModal, /选择已有批次/u)
  assert.match(completionModal, /填写新批次号/u)
  assert.match(completionModal, /afterOpenChange=\{initializeOpenForm\}/u)
  assert.match(completionAction, /buildSourceInboundLotFields/u)
  assert.match(completionAction, /normalizeSourceInboundLotRequestFields/u)
  assert.match(completionAction, /new_lot_no/u)
})

test('released production order detail renders frozen requirements and fails closed on review', () => {
  assert.match(form, /物料需求与领料/u)
  assert.match(form, /计划需求/u)
  assert.match(form, /已过账领料/u)
  assert.match(form, /剩余可领/u)
  assert.match(form, /物料需求需要复核，暂不能领料/u)
  assert.match(form, /PRODUCTION_MATERIAL_REQUIREMENTS_STATE\.NEEDS_REVIEW/u)
  assert.match(form, /isProductionMaterialIssueEligible/u)
  assert.match(page, /aggregate\?\.materialRequirementsState/u)
  assert.doesNotMatch(form, />NEEDS_REVIEW</u)
})

test('production material issue uses exact permission and source-bound RPC contracts', () => {
  assert.match(page, /'production\.material_issue\.create'/u)
  assert.match(page, /listProductionOrderMaterialRequirements/u)
  assert.match(page, /createProductionMaterialIssueFromOrder\(params\)/u)
  assert.match(
    materialIssueAction,
    /production_order_material_requirement_id:\s*Number\(requirement\.id\)/u
  )
  assert.match(page, /sourceBusinessActionNo\([\s\S]*'PROD-MI'/u)
  assert.match(page, /filterProductionMaterialIssueLots/u)
  assert.match(materialIssueModal, /需求物料/u)
  assert.match(materialIssueModal, /材料批次/u)
  assert.match(materialIssueModal, /destroyOnHidden/u)
  const payloadBuilder = materialIssueAction.slice(
    materialIssueAction.indexOf(
      'export function buildProductionMaterialIssuePayload'
    ),
    materialIssueAction.indexOf(
      'export function validateProductionMaterialIssueResult'
    )
  )
  for (const forbiddenTransportField of [
    'material_id',
    'unit_id',
    'source_type',
    'source_id',
    'subject_type',
    'subject_id',
    'idempotency_key',
  ]) {
    assert.doesNotMatch(
      payloadBuilder,
      new RegExp(`${forbiddenTransportField}:`, 'u')
    )
  }
})

test('production material issue is latest-wins, retry-safe and rereads unknown results', () => {
  assert.match(
    page,
    /beginLatestRequest\('production-material-issue-context'\)/u
  )
  assert.match(page, /beginLatestRequest\('production-material-issue-lots'\)/u)
  assert.match(page, /materialIssueContextRequestRef/u)
  assert.match(page, /materialIssueInFlightRef\.current/u)
  assert.match(page, /isSourceBusinessActionResultUnknown\(error\)/u)
  assert.match(page, /findProductionMaterialIssueResult/u)
  assert.match(page, /refreshProductionSources\(order\.id\)/u)
  assert.match(page, /setMaterialIssueContext\(EMPTY_MATERIAL_ISSUE_CONTEXT\)/u)
  assert.match(
    page,
    /暂时无法确认是否处理成功，请保持内容不变后重试，避免重复记录/u
  )
})
