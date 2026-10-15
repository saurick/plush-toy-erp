import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SHIPMENT_SOURCE_TYPE_KEY,
  SHIPMENT_RELEASE_TASK_GROUP,
  isShipmentReleaseTask,
  resolveFinishedGoodsTaskBusinessStatus,
} from './finishedGoodsFlow.mjs'

import * as flow from './finishedGoodsFlow.mjs'
import {
  assertServerOwnedTaskMatchers,
  assertSourceOmitsSymbols,
  mobileWorkflowSources,
} from '../../../scripts/test/workflowFlowContract.mjs'

const {
  actions: mobileRoleTaskActionsSource,
  page: mobileRoleTasksPageSource,
} = mobileWorkflowSources

function shipmentReleaseSourceTask(sourceID = 42, overrides = {}) {
  return {
    id: 420,
    version: 1,
    task_code: 'PROC-210-NODE-220-A1',
    task_group: SHIPMENT_RELEASE_TASK_GROUP,
    source_type: SHIPMENT_SOURCE_TYPE_KEY,
    source_id: sourceID,
    business_status_key: '',
    task_status_key: 'ready',
    owner_role_key: 'finance',
    process_instance_id: 210,
    process_node_instance_id: 220,
    payload: {},
    ...overrides,
  }
}

test('finishedGoodsFlow: 移动端成品抽检状态动作不再本地创建下游任务', () => {
  assertSourceOmitsSymbols(mobileRoleTasksPageSource, 'MobileRoleTasksPage', [
    'buildFinishedGoodsInboundTask',
    'buildFinishedGoodsReworkTask',
    'passFinishedGoodsQcTask',
    'failFinishedGoodsQcTask',
    'FINISHED_GOODS_INBOUND_TASK_GROUP',
    'FINISHED_GOODS_REWORK_TASK_GROUP',
    'completeFinishedGoodsInboundTask',
    'completeShipmentReleaseTask',
    'buildShipmentReleaseTask',
    'SHIPMENT_RELEASE_TASK_GROUP',
    "shipment_result: 'shipped'",
    'RECEIVABLE_REGISTRATION_TASK_GROUP',
    'buildReceivableRegistrationTask',
  ])
  assertSourceOmitsSymbols(
    mobileRoleTaskActionsSource,
    'useMobileRoleTaskActions',
    [
      'runFinishedGoodsFollowUp',
      'completeFinishedGoodsReworkTask',
      'FINISHED_GOODS_PRODUCTION_PROCESSING_STATUS_KEY',
    ]
  )
})

test('finishedGoodsFlow: canonical 出货放行来源任务保持只读识别', () => {
  const shipmentTask = shipmentReleaseSourceTask()
  assert.equal(isShipmentReleaseTask(shipmentTask), true)
  assert.equal(shipmentTask.task_group, SHIPMENT_RELEASE_TASK_GROUP)
  assert.equal(shipmentTask.source_type, SHIPMENT_SOURCE_TYPE_KEY)
  assert.equal(shipmentTask.business_status_key, '')
  assert.equal(shipmentTask.owner_role_key, 'finance')
  assert.equal(
    resolveFinishedGoodsTaskBusinessStatus(shipmentTask, 'done'),
    'shipping_released'
  )
  assert.equal(
    resolveFinishedGoodsTaskBusinessStatus(shipmentTask, 'blocked'),
    'blocked'
  )
  assert.equal(
    resolveFinishedGoodsTaskBusinessStatus(shipmentTask, 'rejected'),
    'blocked'
  )
  assert.equal(
    isShipmentReleaseTask({
      ...shipmentTask,
      source_type: 'shipments',
    }),
    false
  )
})

test('finishedGoodsFlow: recognizes server tasks without exposing client task builders', () => {
  assertServerOwnedTaskMatchers(flow, [
    {
      matcher: 'isFinishedGoodsQcTask',
      sourceType: 'production-progress',
      taskGroup: 'finished_goods_qc',
    },
    {
      matcher: 'isFinishedGoodsInboundTask',
      sourceType: 'inbound',
      taskGroup: 'finished_goods_inbound',
    },
    {
      matcher: 'isShipmentReleaseTask',
      sourceType: 'shipment',
      taskGroup: 'shipment_finance_approval',
    },
  ])
})

test('finished goods projection keeps finance approval distinct from shipped', () => {
  const task = {
    source_type: 'shipment',
    task_group: 'shipment_finance_approval',
  }
  assert.equal(
    flow.resolveFinishedGoodsTaskBusinessStatus(task, 'done'),
    'shipping_released'
  )
  assert.equal(
    flow.resolveFinishedGoodsTaskBusinessStatus(task, 'rejected'),
    'blocked'
  )
  assert.equal(
    flow.resolveFinishedGoodsTaskBusinessStatus(
      { source_type: 'other' },
      'done'
    ),
    null
  )
  assert.deepEqual(task, {
    source_type: 'shipment',
    task_group: 'shipment_finance_approval',
  })
})
