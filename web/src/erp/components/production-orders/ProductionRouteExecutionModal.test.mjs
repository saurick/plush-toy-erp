import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ProductionRouteExecutionModal.jsx', import.meta.url),
  'utf8'
)

test('production route modal is a self-contained production-order surface', () => {
  assert.match(source, /BusinessFormModal/u)
  assert.match(source, /getProductionWip/u)
  assert.doesNotMatch(source, /initializeProductionWip/u)
  assert.match(source, /executeProductionWipAction/u)
  for (const permissionProp of [
    'canAssign',
    'canExecute',
    'canRework',
    'canConfirmPackaging',
    'canReadOutsourcingContracts',
  ]) {
    assert.match(source, new RegExp(`${permissionProp}\\s*=\\s*false`, 'u'))
  }
  assert.match(source, /title="生产工序办理"/u)
})

test('route actions use separate business permissions and cancellation is assign-only', () => {
  assert.match(source, /canRunAction/u)
  assert.match(source, /PRODUCTION_WIP_ACTION\.CANCEL_BATCH/u)
  assert.match(source, /canAssign \? \(/u)
  assert.match(source, /canExecute \? \(/u)
  assert.match(source, /canConfirmPackaging \? \(/u)
  assert.match(source, /canRework \? \(/u)
  assert.match(source, /取消只终止当前尚未开工的批次/u)
  assert.match(source, /不会重新拆分数量/u)
  assert.match(source, /请填写取消原因/u)
  assert.doesNotMatch(source, /canManage/u)
})

test('confirmed plush flow and internal versus external wording stay explicit', () => {
  assert.match(source, /布料加工 → 车缝 → 手工 → 包装/u)
  assert.match(source, /先车缝、后手工/u)
  assert.match(source, /车间移交 \/ WIP 转移/u)
  assert.match(source, /外发完成返回才叫回仓/u)
  assert.match(source, /正常首道布料加工固定按生产明细整单外发/u)
  assert.match(source, /裁片返工按返工批次处理/u)
  assert.match(source, /车缝、手工两道分别独立决定本厂或外发/u)
  assert.match(source, /包装在本厂完成/u)
  assert.doesNotMatch(source, /每道生产工序分别决定本厂或外发/u)
})

test('completion, formal quality and transfer are three separate gates', () => {
  assert.match(source, /PRODUCTION_WIP_ACTION\.COMPLETE_OPERATION/u)
  assert.match(source, /PRODUCTION_WIP_ACTION\.RECEIVE_OUTSOURCING_RETURN/u)
  assert.match(source, /PRODUCTION_WIP_ACTION\.TRANSFER_TO_NEXT_OPERATION/u)
  assert.match(source, /status === 'ACCEPTED' && Boolean\(nextOperation\)/u)
  assert.match(source, /完工或回仓不会自动跳到下道工序/u)
  assert.match(source, /检验合格后才能转下道/u)
  assert.match(source, /“质量检验”办理/u)
  assert.match(source, /productionWipQualitySummary/u)
})

test('modal uses only canonical batch statuses and operation snapshot fields', () => {
  for (const status of [
    'PLANNED',
    'IN_PROGRESS',
    'OUTSOURCED',
    'ACCEPTED',
    'REJECTED',
  ]) {
    assert.match(source, new RegExp(`['"]${status}['"]`, 'u'))
  }
  assert.doesNotMatch(source, /['"](?:READY|ASSIGNED|COMPLETED|BLOCKED)['"]/u)
  assert.match(source, /production_order_operation_id/u)
  assert.match(source, /source_batch_id/u)
  assert.doesNotMatch(source, /current_operation_id|parent_batch_id/u)
  assert.doesNotMatch(source, /operation\.(?:kind|status|sort_order)/u)
})

test('assignment, split and rework preserve quantity and external-contract boundaries', () => {
  assert.match(source, /PRODUCTION_WIP_ACTION\.SPLIT_BATCH/u)
  assert.match(source, /拆分数量必须小于当前批次数量/u)
  assert.match(source, /buildProductionWipConservingSplits/u)
  assert.match(
    source,
    /buildProductionWipConservingSplits\(\s*selectedBatch\.quantity,\s*values\.quantity\s*\)/u
  )
  assert.doesNotMatch(source, /batch_no/u)
  assert.match(source, /outsourcing_allocations/u)
  assert.match(
    source,
    /outsourcing_order_item_id:\s*values\.outsourcing_order_item_id/u
  )
  assert.match(source, /production_order_material_requirement_id/u)
  assert.match(source, /fabricMaterialRequirements\.map/u)
  assert.match(source, /布料加工合同/u)
  assert.match(source, /同一份合同/u)
  assert.match(source, /外发开工前还必须把合同对应材料发料过账/u)
  assert.match(source, /关联加工合同明细/u)
  assert.match(source, /listAllOutsourcingOrders/u)
  assert.match(source, /lifecycle_status:\s*'confirmed'/u)
  assert.match(source, /listAllOutsourcingOrderItems/u)
  assert.match(source, /line_status:\s*'open'/u)
  assert.match(source, /canReadOutsourcingContracts/u)
  assert.match(source, /提交时后端仍会最终复核/u)
  assert.match(source, /operation\.operation_code !== 'FABRIC_PROCESSING'/u)
  assert.match(source, /布料加工按整单外发，首道不拆批/u)
  assert.match(source, /转入车缝后，才可按产品数量拆分/u)
  assert.match(source, /裁片返工按当前返工批次关联一条产品加工/u)
  assert.match(source, /PRODUCTION_WIP_ACTION\.REWORK/u)
  assert.match(source, /返工数量不能超过当前批次数量/u)
  assert.match(source, /target_operation_id/u)
})

test('packaging confirmation is item-level and shows only business evidence', () => {
  assert.match(source, /productionWipPackagingConfirmationForBatch/u)
  assert.match(
    source,
    /production_order_item_id:\s*selectedBatch\.production_order_item_id/u
  )
  assert.match(
    source,
    /expected_version:\s*selectedPackagingConfirmation\?\.version/u
  )
  assert.match(source, /packaging_version_snapshot/u)
  assert.match(source, /包装版本/u)
  assert.match(source, /请填写已确认的包装版本/u)
  assert.match(source, /maxLength=\{128\}/u)
  assert.match(source, /displayUnixTime\(confirmation\.confirmed_at\)/u)
  assert.doesNotMatch(source, /confirmed_by_name/u)
})

test('actions retain one idempotency key across uncertain retries', () => {
  assert.doesNotMatch(source, /initializationAttemptRef/u)
  assert.match(source, /actionAttemptRef/u)
  assert.match(source, /idempotencyKey:\s*productionWipUUID\(\)/u)
  assert.match(source, /const signature = JSON\.stringify/u)
  assert.match(
    source,
    /idempotency_key:\s*actionAttemptRef\.current\.idempotencyKey/u
  )
})

test('missing released route is an integrity error and cannot be initialized from the page', () => {
  assert.match(source, /当前生产订单的工序路线不完整/u)
  assert.match(source, /标准路线只在生产订单发布时冻结/u)
  assert.doesNotMatch(source, /建立标准工序路线/u)
})

test('stale route reads are aborted and raw technical IDs are not visible labels', () => {
  assert.match(source, /new AbortController\(\)/u)
  assert.match(source, /requestSequenceRef/u)
  assert.match(source, /isRpcAbortError/u)
  assert.doesNotMatch(
    source,
    /(?:label|title|message|description)=["'`][^"'`]*(?:ID|_id)[^"'`]*["'`]/u
  )
  assert.doesNotMatch(source, />\s*(?:订单|批次|工序|委外明细)\s*ID\s*</u)
})
