import assert from 'node:assert/strict'
import test from 'node:test'
import { readContractSource as readFileSync } from '../../../../scripts/test/publicContractSource.mjs'

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
    'canReceiveReturn',
    'canWarehousePackaging',
    'canIssueCutting',
    'canConfirmPackaging',
    'canReadOutsourcingContracts',
  ]) {
    assert.match(source, new RegExp(`${permissionProp}\\s*=\\s*false`, 'u'))
  }
  assert.match(source, /assignmentOnly\s*=\s*false/u)
  assert.match(source, /originReworkFactID\s*=\s*null/u)
  assert.match(
    source,
    /assignmentOnly[\s\S]*?'安排本厂或外发加工'[\s\S]*?readOnly[\s\S]*?'查看返工工序'[\s\S]*?'查看生产工序'[\s\S]*?'返工工序办理'[\s\S]*?'生产工序办理'/u
  )
  assert.match(
    source,
    /const readOnly =[\s\S]*?!canAssign[\s\S]*?!canExecute[\s\S]*?!canWarehousePackaging[\s\S]*?!canConfirmPackaging/u
  )
})

test('route actions use separate business permissions and cancellation is assign-only', () => {
  assert.match(source, /canRunAction/u)
  assert.match(source, /PRODUCTION_WIP_ACTION\.CANCEL_BATCH/u)
  assert.match(source, /actionVisible\(PRODUCTION_WIP_ACTION\.ASSIGN_EXECUTION\)/u)
  assert.match(
    source,
    /\(canExecute \|\| canReceiveReturn \|\| canWarehousePackaging \|\| canIssueCutting\) && !assignmentOnly \? \(/u
  )
  assert.match(
    source,
    /action === PRODUCTION_WIP_ACTION\.RECEIVE_OUTSOURCING_RETURN[\s\S]*?return canReceiveReturn/u
  )
  assert.match(
    source,
    /canRunAction\(action\) &&\s*productionWipActionRelevant/u
  )
  for (const action of [
    'START_OPERATION',
    'TRANSFER_TO_NEXT_OPERATION',
    'CONFIRM_PACKAGING_MATERIAL',
  ]) {
    assert.match(
      source,
      new RegExp(
        `actionVisible\\(\\s*PRODUCTION_WIP_ACTION\\.${action}\\s*\\)`,
        'u'
      )
    )
  }
  assert.match(source, /actionVisible\(completionAction\)/u)
  assert.match(source, /取消只终止当前尚未开工的批次/u)
  assert.match(source, /不会重新拆分数量/u)
  assert.match(source, /请填写取消原因/u)
  assert.doesNotMatch(source, /canManage/u)
})

test('assignment-only mode is scoped to the trusted rework batch and one mutation', () => {
  assert.match(
    source,
    /assignmentOnly &&\s*action !== PRODUCTION_WIP_ACTION\.ASSIGN_EXECUTION/u
  )
  assert.match(source, /batch\.origin_rework_fact_id === scopedReworkFactID/u)
  assert.match(source, /options=\{displayedBatches\.map/u)
  assert.match(source, /dataSource=\{displayedBatches\}/u)
  assert.match(source, /status === 'PLANNED' && !batch\.execution_mode/u)
  assert.match(source, /只为当前返工任务关联的在制批次选择生产方式/u)
  assert.match(source, /不会自动完成当前任务/u)
  assert.match(source, /不会登记完工、回仓、质检或库存/u)
  assert.match(source, /未找到与当前返工任务一致的在制批次/u)
  assert.match(source, /!assignmentOnly && !focusedEntry \? \(\s*<Steps/u)
})

test('confirmed flow keeps warehouse receipt before packing and separates production assignment', () => {
  assert.match(source, /裁片 → 车缝 → 手工 → 成品入库 → 查货与包装/u)
  assert.match(source, /车缝、手工可本厂或委外/u)
  assert.match(source, /检验与包装完成后才可发货/u)
  assert.match(source, /currentOperation\?\.operation_code === 'PACKAGING'[\s\S]*return canWarehousePackaging/u)
  assert.match(source, /currentOperation\?\.operation_code === 'FABRIC_PROCESSING'[\s\S]*return canIssueCutting/u)
})

test('completion, formal quality and transfer are three separate gates', () => {
  assert.match(source, /PRODUCTION_WIP_ACTION\.COMPLETE_OPERATION/u)
  assert.match(source, /PRODUCTION_WIP_ACTION\.RECEIVE_OUTSOURCING_RETURN/u)
  assert.match(source, /PRODUCTION_WIP_ACTION\.TRANSFER_TO_NEXT_OPERATION/u)
  assert.match(source, /status === 'ACCEPTED' && Boolean\(nextOperation\)/u)
  assert.match(source, /仓库先清点本批次实收数量/u)
  assert.match(source, /暂不能整批送检/u)
  assert.match(source, /“质量检验”办理/u)
  assert.match(source, /productionWipQualitySummary/u)
})

test('modal uses only canonical batch statuses and operation snapshot fields', () => {
  for (const status of [
    'PLANNED',
    'IN_PROGRESS',
    'OUTSOURCED',
    'ACCEPTED',
  ]) {
    assert.match(source, new RegExp(`['"]${status}['"]`, 'u'))
  }
  assert.doesNotMatch(source, /['"](?:READY|ASSIGNED|COMPLETED|BLOCKED)['"]/u)
  assert.match(source, /currentProductionWipOperation/u)
  assert.match(source, /productionWipOperationsForBatch/u)
  assert.doesNotMatch(source, /current_operation_id|parent_batch_id/u)
  assert.doesNotMatch(source, /operation\.(?:kind|status|sort_order)/u)
})

test('assignment and split preserve quantity while rework requires an exception decision', () => {
  assert.match(source, /PRODUCTION_WIP_ACTION\.SPLIT_BATCH/u)
  assert.match(source, /拆分数量必须小于当前批次数量/u)
  assert.match(source, /buildProductionWipFormPayload/u)
  assert.match(source, /batch: selectedBatch/u)
  assert.match(source, /materialRequirements: fabricMaterialRequirements/u)
  assert.doesNotMatch(source, /batch_no/u)
  assert.match(source, /布料加工合同/u)
  assert.match(source, /同一份合同/u)
  assert.match(source, /外发开工前还必须把合同对应材料发料过账/u)
  assert.match(source, /关联加工合同明细/u)
  assert.match(source, /listAllOutsourcingOrders/u)
  assert.match(source, /lifecycle_status:\s*'confirmed'/u)
  assert.match(source, /listAllOutsourcingOrderItems/u)
  assert.match(source, /line_status:\s*'open'/u)
  assert.match(source, /canReadOutsourcingContracts/u)
  assert.match(source, /提交时会再次核对/u)
  assert.match(source, /operation\.operation_code !== 'FABRIC_PROCESSING'/u)
  assert.match(source, /布料加工按生产明细整单外发，不在首道拆批/u)
  assert.match(source, /裁片检验合格后再移交缝制/u)
  assert.match(source, /裁片返工按当前返工批次关联一条产品加工/u)
  assert.doesNotMatch(source, /PRODUCTION_WIP_ACTION\.REWORK/u)
  assert.match(source, /finished_goods_receipt_id/u)
})

test('packaging confirmation is item-level and shows only business evidence', () => {
  assert.match(source, /productionWipPackagingConfirmationForBatch/u)
  assert.match(source, /packagingConfirmation: selectedPackagingConfirmation/u)
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

test('closed orders keep normal batches read-only and continue only finished-goods rework', () => {
  assert.match(source, /productionWipActionAllowedForOrder/u)
  assert.match(source, /productionWipBatchLineageMeta/u)
  assert.match(source, /orderStatus === 'CLOSED'/u)
  assert.match(source, /origin_rework_fact_id/u)
  assert.match(source, /成品返工补制/u)
  assert.match(source, /原生产批次只读/u)
  assert.match(source, /成品返工如需撤销，请回到返工记录办理/u)
  assert.match(
    source,
    /actionButtonEnabled\([\s\S]*authoritativeOrder[\s\S]*actionForm\.validateFields/u
  )
  assert.doesNotMatch(source, />\s*origin_rework_fact_id\s*</u)
})
