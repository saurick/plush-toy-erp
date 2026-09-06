import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import test from 'node:test'

import {
  SHIPMENT_SOURCE_TYPE_KEY,
  SHIPMENT_RELEASE_TASK_GROUP,
  isShipmentReleaseTask,
  resolveFinishedGoodsTaskBusinessStatus,
} from './finishedGoodsFlow.mjs'

const mobileRoleTasksPageSource = readFileSync(
  new URL('../mobile/pages/MobileRoleTasksPage.jsx', import.meta.url),
  'utf8'
)

const mobileRoleTaskActionsSource = readFileSync(
  new URL('../mobile/hooks/useMobileRoleTaskActions.js', import.meta.url),
  'utf8'
)

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
  assert.equal(
    mobileRoleTasksPageSource.includes('buildFinishedGoodsInboundTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('buildFinishedGoodsReworkTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('passFinishedGoodsQcTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('failFinishedGoodsQcTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('FINISHED_GOODS_INBOUND_TASK_GROUP'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('FINISHED_GOODS_REWORK_TASK_GROUP'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('completeFinishedGoodsInboundTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('completeShipmentReleaseTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('buildShipmentReleaseTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('SHIPMENT_RELEASE_TASK_GROUP'),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes('runFinishedGoodsFollowUp'),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes('completeFinishedGoodsReworkTask'),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes(
      'FINISHED_GOODS_PRODUCTION_PROCESSING_STATUS_KEY'
    ),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes("shipment_result: 'shipped'"),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('RECEIVABLE_REGISTRATION_TASK_GROUP'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('buildReceivableRegistrationTask'),
    false
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

import * as flow from './finishedGoodsFlow.mjs'

test('finishedGoodsFlow: recognizes server tasks without exposing client task builders', () => {
  assert.equal(
    Object.keys(flow).some((name) => name.startsWith('build')),
    false
  )
  for (const [matcher, sourceType, taskGroup] of [
    ['isFinishedGoodsQcTask', 'production-progress', 'finished_goods_qc'],
    ['isFinishedGoodsInboundTask', 'inbound', 'finished_goods_inbound'],
    ['isShipmentReleaseTask', 'shipment', 'shipment_finance_approval'],
  ]) {
    assert.equal(
      flow[matcher]({ source_type: sourceType, task_group: taskGroup }),
      true
    )
    assert.equal(
      flow[matcher]({ source_type: 'unrelated', task_group: taskGroup }),
      false
    )
    assert.equal(
      flow[matcher]({ source_type: sourceType, task_group: 'unrelated' }),
      false
    )
    assert.equal(flow[matcher]({}), false)
  }
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
