import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildWorkflowTaskAlert } from './workflowDashboardStats.mjs'
import {
  FINISHED_GOODS_INBOUND_TASK_GROUP,
  FINISHED_GOODS_QC_TASK_GROUP,
  FINISHED_GOODS_REWORK_TASK_GROUP,
  SHIPMENT_SOURCE_TYPE_KEY,
  SHIPMENT_RELEASE_TASK_GROUP,
  buildFinishedGoodsInboundTask,
  buildFinishedGoodsQcTask,
  buildFinishedGoodsReworkTask,
  hasActiveFinishedGoodsInboundTaskForRecord,
  hasActiveFinishedGoodsQcTaskForRecord,
  hasActiveShipmentReleaseTaskForRecord,
  isFinishedGoodsInboundTask,
  isFinishedGoodsQcFailResult,
  isFinishedGoodsQcPassResult,
  isFinishedGoodsQcTask,
  isFinishedGoodsReworkTask,
  isProductionCompletedRecord,
  isShipmentReleaseTask,
  resolveFinishedGoodsTaskBusinessStatus,
} from './finishedGoodsFlow.mjs'

const NOW_MS = Date.parse('2026-04-25T00:00:00Z')
const NOW_SECONDS = Math.floor(NOW_MS / 1000)
const mobileRoleTasksPageSource = readFileSync(
  new URL('../mobile/pages/MobileRoleTasksPage.jsx', import.meta.url),
  'utf8'
)
const mobileRoleTaskActionsSource = readFileSync(
  new URL('../mobile/hooks/useMobileRoleTaskActions.js', import.meta.url),
  'utf8'
)

function productionRecord(overrides = {}) {
  return {
    id: 42,
    module_key: 'production-progress',
    document_no: 'PP-042',
    title: '小熊公仔完工',
    business_status_key: 'production_processing',
    source_no: 'SO-2026-042',
    product_name: '小熊公仔',
    quantity: 1200,
    unit: '只',
    due_date: '2026-04-25',
    payload: {
      finished: true,
      packaging_requirement: '彩盒 12 只/箱',
      shipping_requirement: '客户唛头',
    },
    ...overrides,
  }
}

function shipmentReleaseSourceTask(sourceID = 42, overrides = {}) {
  return {
    id: 420,
    version: 1,
    task_code: `source-shipment-release-${sourceID}`,
    task_group: SHIPMENT_RELEASE_TASK_GROUP,
    source_type: SHIPMENT_SOURCE_TYPE_KEY,
    source_id: sourceID,
    business_status_key: 'shipment_pending',
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    payload: {
      source_task_contract: 'workflow.source-task/v1',
      source_task_producer: 'shipment.submit_release',
      shipment_id: sourceID,
    },
    ...overrides,
  }
}

test('finishedGoodsFlow: production-progress 记录能生成成品抽检任务', () => {
  const task = buildFinishedGoodsQcTask(productionRecord(), { nowMs: NOW_MS })

  assert.equal(isProductionCompletedRecord(productionRecord()), true)
  assert.equal(isFinishedGoodsQcTask(task), true)
  assert.equal(task.task_group, FINISHED_GOODS_QC_TASK_GROUP)
  assert.equal(task.task_name, '成品抽检')
  assert.equal(task.source_type, 'production-progress')
  assert.equal(task.business_status_key, 'qc_pending')
  assert.equal(task.owner_role_key, 'quality')
  assert.equal(task.priority >= 3, true)
  assert.equal(task.due_at, NOW_SECONDS + 4 * 60 * 60)
  assert.equal(task.due_at < NOW_MS, true)
  assert.equal(task.payload.alert_type, 'finished_goods_qc_pending')
})

test('finishedGoodsFlow: 成品抽检合格能生成仓库成品入库任务', () => {
  const qcTask = buildFinishedGoodsQcTask(productionRecord(), {
    nowMs: NOW_MS,
  })
  const inboundTask = buildFinishedGoodsInboundTask(
    productionRecord(),
    { ...qcTask, id: 99, priority: 3, payload: { qc_result: 'pass' } },
    { nowMs: NOW_MS }
  )

  assert.equal(isFinishedGoodsInboundTask(inboundTask), true)
  assert.equal(inboundTask.task_group, FINISHED_GOODS_INBOUND_TASK_GROUP)
  assert.equal(inboundTask.business_status_key, 'warehouse_inbound_pending')
  assert.equal(inboundTask.owner_role_key, 'warehouse')
  assert.equal(inboundTask.priority, 3)
  assert.equal(inboundTask.due_at, NOW_SECONDS + 4 * 60 * 60)
  assert.equal(
    inboundTask.payload.complete_condition,
    '仓库确认成品入库数量、库位和经手人'
  )
  assert.equal(inboundTask.payload.qc_result, 'pass')
  assert.equal(
    inboundTask.payload.related_documents.includes('成品抽检结果：合格'),
    true
  )
  assert.equal(
    inboundTask.payload.related_documents.some((item) => item.includes('pass')),
    false
  )
  assert.equal(inboundTask.payload.inventory_balance_deferred, true)
})

test('finishedGoodsFlow: 成品抽检未知结果不透出 raw key', () => {
  const inboundTask = buildFinishedGoodsInboundTask(
    productionRecord(),
    {
      id: 99,
      priority: 3,
      payload: { approval_result: 'custom_finished_goods_qc_key' },
    },
    { nowMs: NOW_MS }
  )

  assert.equal(
    inboundTask.payload.related_documents.includes('成品抽检结果：抽检已记录'),
    true
  )
  assert.equal(
    inboundTask.payload.related_documents.some((item) =>
      item.includes('custom_finished_goods_qc_key')
    ),
    false
  )
})

test('finishedGoodsFlow: 成品抽检不合格能生成生产返工任务和 critical 预警', () => {
  const reworkTask = buildFinishedGoodsReworkTask(
    productionRecord(),
    { id: 100 },
    '车缝开线',
    { nowMs: NOW_MS }
  )
  const alert = buildWorkflowTaskAlert(reworkTask, { nowMs: NOW_MS })

  assert.equal(isFinishedGoodsReworkTask(reworkTask), true)
  assert.equal(reworkTask.task_group, FINISHED_GOODS_REWORK_TASK_GROUP)
  assert.equal(reworkTask.business_status_key, 'qc_failed')
  assert.equal(reworkTask.owner_role_key, 'production')
  assert.equal(reworkTask.priority, 3)
  assert.equal(reworkTask.payload.qc_result, 'fail')
  assert.equal(
    reworkTask.payload.related_documents.includes('成品抽检结果：不合格'),
    true
  )
  assert.equal(
    reworkTask.payload.related_documents.some((item) => item.includes('fail')),
    false
  )
  assert.equal(reworkTask.payload.rejected_reason, '车缝开线')
  assert.equal(alert.alert_type, 'qc_failed')
  assert.equal(alert.alert_level, 'critical')
})

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
  assert.equal(shipmentTask.business_status_key, 'shipment_pending')
  assert.equal(shipmentTask.owner_role_key, 'warehouse')
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
      source_type: 'shipping-release',
    }),
    false
  )
})

test('finishedGoodsFlow: 成品入库真实运行时失败状态只回到 blocked', () => {
  const qcTask = buildFinishedGoodsQcTask(productionRecord(), {
    nowMs: NOW_MS,
  })
  const inboundTask = buildFinishedGoodsInboundTask(
    productionRecord(),
    qcTask,
    {
      nowMs: NOW_MS,
    }
  )

  assert.equal(
    resolveFinishedGoodsTaskBusinessStatus(inboundTask, 'done'),
    'inbound_done'
  )
  assert.equal(
    resolveFinishedGoodsTaskBusinessStatus(inboundTask, 'blocked'),
    'blocked'
  )
  assert.equal(
    resolveFinishedGoodsTaskBusinessStatus(inboundTask, 'rejected'),
    'blocked'
  )
})

test('finishedGoodsFlow: 质检结果判断覆盖合格和不合格口径', () => {
  assert.equal(isFinishedGoodsQcPassResult('released'), true)
  assert.equal(isFinishedGoodsQcPassResult('放行'), true)
  assert.equal(isFinishedGoodsQcFailResult('rejected'), true)
  assert.equal(isFinishedGoodsQcFailResult('返工'), true)
})

test('finishedGoodsFlow: 缺 source_no / document_no 时不崩溃', () => {
  const task = buildFinishedGoodsQcTask(
    productionRecord({
      document_no: '',
      source_no: '',
      title: '',
    }),
    { nowMs: NOW_MS }
  )
  const taskWithInternalSourceNo = buildFinishedGoodsQcTask(
    productionRecord({
      document_no: '',
      source_no: '42',
      title: '',
    }),
    { nowMs: NOW_MS }
  )

  assert.equal(task.source_no, '')
  assert.equal(taskWithInternalSourceNo.source_no, '')
  assert.equal(task.payload.related_documents.includes('生产进度：42'), false)
  assert.equal(
    taskWithInternalSourceNo.payload.related_documents.includes('生产进度：42'),
    false
  )
  assert.equal(
    taskWithInternalSourceNo.payload.related_documents.includes(
      '生产进度已关联'
    ),
    true
  )
  assert.equal(
    taskWithInternalSourceNo.payload.related_documents.includes('订单已关联'),
    true
  )
})

test('finishedGoodsFlow: 非生产模块不误生成成品抽检任务', () => {
  assert.equal(
    buildFinishedGoodsQcTask({
      id: 1,
      module_key: 'processing-contracts',
      business_status_key: 'production_processing',
      payload: { finished: true },
    }),
    null
  )
})

test('finishedGoodsFlow: 已存在未完成任务时按记录去重', () => {
  const record = productionRecord()
  const qcTask = buildFinishedGoodsQcTask(record, { nowMs: NOW_MS })
  const inboundTask = buildFinishedGoodsInboundTask(record, qcTask, {
    nowMs: NOW_MS,
  })
  const shipmentTask = shipmentReleaseSourceTask(record.id)

  assert.equal(hasActiveFinishedGoodsQcTaskForRecord([qcTask], record), true)
  assert.equal(
    hasActiveFinishedGoodsInboundTaskForRecord([inboundTask], record),
    true
  )
  assert.equal(
    hasActiveShipmentReleaseTaskForRecord([shipmentTask], record),
    true
  )
  assert.equal(
    hasActiveShipmentReleaseTaskForRecord(
      [{ ...shipmentTask, task_status_key: 'blocked' }],
      record
    ),
    true
  )
  assert.equal(
    hasActiveShipmentReleaseTaskForRecord(
      [{ ...shipmentTask, task_status_key: 'done' }],
      record
    ),
    false
  )
  assert.equal(
    hasActiveFinishedGoodsQcTaskForRecord(
      [{ ...qcTask, task_status_key: 'blocked' }],
      record
    ),
    true
  )
  assert.equal(
    hasActiveFinishedGoodsQcTaskForRecord(
      [{ ...qcTask, task_status_key: 'done' }],
      record
    ),
    false
  )
  assert.equal(
    hasActiveFinishedGoodsQcTaskForRecord(
      [{ ...qcTask, task_status_key: 'rejected' }],
      record
    ),
    false
  )
})
