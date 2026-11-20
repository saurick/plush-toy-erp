import assert from 'node:assert/strict'
import test from 'node:test'

import * as flow from './purchaseInboundFlow.mjs'
import {
  assertCanonicalTaskReload,
  assertServerOwnedTaskMatchers,
  assertSourceOmitsSymbols,
  mobileWorkflowSources,
} from '../../../scripts/test/workflowFlowContract.mjs'

const {
  actions: mobileRoleTaskActionsSource,
  model: mobileRoleTaskModelSource,
  page: mobileRoleTasksPageSource,
} = mobileWorkflowSources

test('MobileRoleTasksPage: 岗位任务完成不在页面本地改写来源状态', () => {
  assertSourceOmitsSymbols(
    mobileRoleTaskActionsSource,
    'useMobileRoleTaskActions',
    ['updateSourceStatusForTask', 'upsertWorkflowBusinessState']
  )
})

test('purchaseInboundFlow: 移动端 IQC 状态动作不再本地创建下游任务', () => {
  assertSourceOmitsSymbols(mobileRoleTasksPageSource, 'MobileRoleTasksPage', [
    'buildWarehouseInboundTaskFromIqcPass',
    'buildPurchaseQualityExceptionTask',
    'passIqcTask',
    'failIqcTask',
    'runPurchaseInboundFollowUp',
  ])
  assertCanonicalTaskReload(mobileRoleTaskActionsSource)
})

test('purchaseInboundFlow: 移动端采购 warehouse_inbound 状态动作交给后端', () => {
  assertSourceOmitsSymbols(mobileRoleTasksPageSource, 'MobileRoleTasksPage', [
    'completeWarehouseInboundTask',
    'buildPurchasePayableRegistrationTask',
    'PURCHASE_PAYABLE_REGISTRATION_TASK_GROUP',
    'runPurchaseInboundFollowUp',
  ])
  assert.match(
    mobileRoleTaskModelSource,
    /if \(isWarehouseInboundTask\(task\)\) {[\s\S]{0,220}if \(taskStatusKey === 'done'\) return INBOUND_DONE_STATUS_KEY[\s\S]{0,220}if \(\['blocked', 'rejected'\]\.includes\(taskStatusKey\)\) return 'blocked'/
  )
  assert.match(
    mobileRoleTaskModelSource,
    /roleKey === 'warehouse' &&[\s\S]{0,120}isWarehouseInboundTask\(task\)/
  )
})

test('purchaseInboundFlow: recognizes server tasks without exposing client task builders', () => {
  assertServerOwnedTaskMatchers(flow, [
    {
      matcher: 'isPurchaseIqcTask',
      sourceType: 'accessories-purchase',
      taskGroup: 'purchase_iqc',
    },
    {
      matcher: 'isWarehouseInboundTask',
      sourceType: 'accessories-purchase',
      taskGroup: 'warehouse_inbound',
    },
  ])
})
