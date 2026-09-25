import test from 'node:test'

import * as flow from './outsourceReturnFlow.mjs'
import {
  assertCanonicalTaskReload,
  assertServerOwnedTaskMatchers,
  assertSourceOmitsSymbols,
  mobileWorkflowSources,
} from '../../../scripts/test/workflowFlowContract.mjs'

const {
  actions: mobileRoleTaskActionsSource,
  page: mobileRoleTasksPageSource,
} = mobileWorkflowSources

test('outsourceReturnFlow: 移动端回货检验状态动作不再本地创建下游任务', () => {
  assertSourceOmitsSymbols(mobileRoleTasksPageSource, 'MobileRoleTasksPage', [
    'buildOutsourceWarehouseInboundTask',
    'buildOutsourceReworkTask',
    'passOutsourceReturnQcTask',
    'failOutsourceReturnQcTask',
  ])
  assertSourceOmitsSymbols(
    mobileRoleTaskActionsSource,
    'useMobileRoleTaskActions',
    [
      'completeOutsourceReturnTrackingTask',
      'buildOutsourceReturnQcTask',
      'OUTSOURCE_QC_PENDING_STATUS_KEY',
      'completeOutsourceReworkTask',
      'OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY',
      'completeOutsourceWarehouseInboundTask',
      'buildOutsourcePayableRegistrationTask',
      'OUTSOURCE_INBOUND_DONE_STATUS_KEY',
    ]
  )
  assertCanonicalTaskReload(mobileRoleTaskActionsSource)
})

test('outsourceReturnFlow: recognizes server tasks without exposing client task builders', () => {
  assertServerOwnedTaskMatchers(flow, [
    {
      matcher: 'isOutsourceReturnTrackingTask',
      sourceType: 'processing-contracts',
      taskGroup: 'outsource_return_tracking',
    },
    {
      matcher: 'isOutsourceReturnQcTask',
      sourceType: 'processing-contracts',
      taskGroup: 'outsource_return_qc',
    },
    {
      matcher: 'isOutsourceWarehouseInboundTask',
      sourceType: 'processing-contracts',
      taskGroup: 'outsource_warehouse_inbound',
    },
    {
      matcher: 'isOutsourceReworkTask',
      sourceType: 'processing-contracts',
      taskGroup: 'outsource_rework',
    },
  ])
})
