import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildOutsourceReturnQcTask,
  buildOutsourceReturnTrackingTask,
  buildOutsourceReworkTask,
  buildOutsourceWarehouseInboundTask,
  hasActiveOutsourceReturnQcTaskForRecord,
  hasActiveOutsourceReturnTrackingTaskForRecord,
  hasActiveOutsourceWarehouseInboundTaskForRecord,
  isOutsourceProcessingRecord,
  isOutsourceQcFailResult,
  isOutsourceQcPassResult,
  resolveOutsourcePriority,
  resolveOutsourceReturnDueAt,
} from './outsourceReturnFlow.mjs'
import { buildWorkflowTaskAlert } from './workflowDashboardStats.mjs'

const NOW_MS = Date.parse('2026-04-25T08:00:00')
const NOW_SEC = Math.floor(NOW_MS / 1000)
const mobileRoleTasksPageSource = readFileSync(
  new URL('../mobile/pages/MobileRoleTasksPage.jsx', import.meta.url),
  'utf8'
)

function processingRecord(overrides = {}) {
  return {
    id: 88,
    module_key: 'processing-contracts',
    document_no: 'PC-001',
    source_no: 'OUT-001',
    title: '兔子挂件委外车缝',
    supplier_name: '联调加工厂',
    product_no: 'SKU-001',
    product_name: '兔子挂件',
    quantity: 300,
    unit: 'pcs',
    due_date: '2026-04-28',
    business_status_key: 'production_processing',
    owner_role_key: 'production',
    payload: {},
    ...overrides,
  }
}

function inboundRecord(overrides = {}) {
  return {
    ...processingRecord({
      module_key: 'inbound',
      document_no: 'IN-OUT-001',
      title: '委外回货通知',
    }),
    ...overrides,
  }
}

test('outsourceReturnFlow: processing-contracts 记录能生成生产回货跟踪任务', () => {
  const task = buildOutsourceReturnTrackingTask(processingRecord(), {
    nowMs: NOW_MS,
  })

  assert.equal(task.task_group, 'outsource_return_tracking')
  assert.equal(task.task_name, '跟踪委外回货')
  assert.equal(task.source_type, 'processing-contracts')
  assert.equal(task.source_id, 88)
  assert.equal(task.source_no, 'PC-001')
  assert.equal(task.business_status_key, 'production_processing')
  assert.equal(task.task_status_key, 'ready')
  assert.equal(task.owner_role_key, 'production')
  assert.equal(task.priority, 2)
  assert.equal(
    task.due_at,
    Math.floor(Date.parse('2026-04-28T23:59:59') / 1000)
  )
  assert.equal(task.payload.alert_type, 'outsource_return_pending')
  assert.equal(task.payload.critical_path, true)
  assert.equal(task.payload.outsource_owner_role_key, 'outsource')
  assert.match(task.payload.complete_condition, /回货登记/)
})

test('outsourceReturnFlow: 委外回货能生成品质回货检验任务', () => {
  const returnTask = buildOutsourceReturnTrackingTask(processingRecord(), {
    nowMs: NOW_MS,
  })
  const task = buildOutsourceReturnQcTask(processingRecord(), returnTask, {
    nowMs: NOW_MS,
  })

  assert.equal(task.task_group, 'outsource_return_qc')
  assert.equal(task.task_name, '委外回货检验')
  assert.equal(task.business_status_key, 'qc_pending')
  assert.equal(task.task_status_key, 'ready')
  assert.equal(task.owner_role_key, 'quality')
  assert.equal(task.priority, 2)
  assert.equal(task.due_at, NOW_SEC + 4 * 60 * 60)
  assert.equal(task.payload.alert_type, 'outsource_return_qc_pending')
  assert.equal(task.payload.qc_type, 'outsource_return')
})

test('outsourceReturnFlow: inbound 委外回货通知可直接生成品质检验任务', () => {
  const task = buildOutsourceReturnQcTask(inboundRecord(), null, {
    nowMs: NOW_MS,
  })

  assert.equal(task.source_type, 'inbound')
  assert.equal(task.source_no, 'IN-OUT-001')
  assert.equal(task.owner_role_key, 'quality')
  assert.equal(task.task_group, 'outsource_return_qc')
})

test('outsourceReturnFlow: 回货检验合格能生成仓库委外入库任务', () => {
  const qcTask = buildOutsourceReturnQcTask(
    processingRecord(),
    buildOutsourceReturnTrackingTask(processingRecord(), { nowMs: NOW_MS }),
    { nowMs: NOW_MS }
  )
  const task = buildOutsourceWarehouseInboundTask(
    processingRecord(),
    {
      ...qcTask,
      payload: { ...qcTask.payload, qc_result: 'accepted' },
    },
    { nowMs: NOW_MS }
  )

  assert.equal(task.task_group, 'outsource_warehouse_inbound')
  assert.equal(task.task_name, '委外回货入库')
  assert.equal(task.business_status_key, 'warehouse_inbound_pending')
  assert.equal(task.task_status_key, 'ready')
  assert.equal(task.owner_role_key, 'warehouse')
  assert.equal(task.priority, 2)
  assert.equal(task.due_at, NOW_SEC + 4 * 60 * 60)
  assert.equal(task.payload.qc_result, 'accepted')
  assert.match(task.payload.complete_condition, /委外回货入库数量/)
})

test('outsourceReturnFlow: 回货检验不合格能生成生产返工补做任务并产生 critical 预警', () => {
  const qcTask = buildOutsourceReturnQcTask(
    processingRecord(),
    {},
    {
      nowMs: NOW_MS,
    }
  )
  const task = buildOutsourceReworkTask(
    processingRecord(),
    qcTask,
    '车缝开线',
    { nowMs: NOW_MS }
  )
  const alert = buildWorkflowTaskAlert(task, { nowMs: NOW_MS })

  assert.equal(task.task_group, 'outsource_rework')
  assert.equal(task.task_name, '委外返工 / 补做处理')
  assert.equal(task.business_status_key, 'qc_failed')
  assert.equal(task.task_status_key, 'ready')
  assert.equal(task.owner_role_key, 'production')
  assert.equal(task.priority, 3)
  assert.equal(task.payload.notification_type, 'qc_failed')
  assert.equal(task.payload.alert_type, 'qc_failed')
  assert.equal(task.payload.rejected_reason, '车缝开线')
  assert.equal(alert?.alert_level, 'critical')
  assert.equal(alert?.alert_type, 'qc_failed')
})

test('outsourceReturnFlow: 移动端回货检验状态动作不再本地创建下游任务', () => {
  assert.equal(
    mobileRoleTasksPageSource.includes('buildOutsourceWarehouseInboundTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('buildOutsourceReworkTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('passOutsourceReturnQcTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('failOutsourceReturnQcTask'),
    false
  )
  assert.match(mobileRoleTasksPageSource, /await loadTasks\(\)/)
})

test('outsourceReturnFlow: due_at 使用 Unix 秒，缺编号字段不崩溃', () => {
  const task = buildOutsourceReturnTrackingTask(
    processingRecord({
      document_no: '',
      source_no: '',
      title: '标题兜底',
      due_date: '',
    }),
    { nowMs: NOW_MS }
  )

  assert.equal(
    resolveOutsourceReturnDueAt(processingRecord(), { nowMs: NOW_MS }) < NOW_MS,
    true
  )
  assert.equal(task.source_no, '标题兜底')
  assert.equal(task.due_at, NOW_SEC + 24 * 60 * 60)
})

test('outsourceReturnFlow: 非 processing-contracts/inbound 模块不误触发', () => {
  const record = processingRecord({ module_key: 'project-orders' })

  assert.equal(isOutsourceProcessingRecord(record), false)
  assert.equal(
    buildOutsourceReturnTrackingTask(record, { nowMs: NOW_MS }),
    null
  )
  assert.equal(buildOutsourceReturnQcTask(record, {}, { nowMs: NOW_MS }), null)
  assert.equal(
    buildOutsourceWarehouseInboundTask(record, {}, { nowMs: NOW_MS }),
    null
  )
  assert.equal(
    buildOutsourceReworkTask(record, {}, 'bad', { nowMs: NOW_MS }),
    null
  )
})

test('outsourceReturnFlow: 结果和优先级判断覆盖常见值', () => {
  assert.equal(
    resolveOutsourcePriority(processingRecord(), { nowMs: NOW_MS }),
    2
  )
  assert.equal(
    resolveOutsourcePriority(processingRecord({ due_date: '2026-04-25' }), {
      nowMs: NOW_MS,
    }),
    4
  )
  assert.equal(isOutsourceQcPassResult('qualified'), true)
  assert.equal(isOutsourceQcPassResult('让步接收'), true)
  assert.equal(isOutsourceQcFailResult('rejected'), true)
  assert.equal(isOutsourceQcFailResult('不合格'), true)
})

test('outsourceReturnFlow: 已存在未完成委外任务时可识别并避免重复创建', () => {
  const record = processingRecord()
  const trackingTask = buildOutsourceReturnTrackingTask(record, {
    nowMs: NOW_MS,
  })
  const qcTask = buildOutsourceReturnQcTask(record, trackingTask, {
    nowMs: NOW_MS,
  })
  const warehouseTask = buildOutsourceWarehouseInboundTask(record, qcTask, {
    nowMs: NOW_MS,
  })

  assert.equal(
    hasActiveOutsourceReturnTrackingTaskForRecord([trackingTask], record),
    true
  )
  assert.equal(
    hasActiveOutsourceReturnTrackingTaskForRecord(
      [{ ...trackingTask, task_status_key: 'done' }],
      record
    ),
    false
  )
  assert.equal(hasActiveOutsourceReturnQcTaskForRecord([qcTask], record), true)
  assert.equal(
    hasActiveOutsourceWarehouseInboundTaskForRecord([warehouseTask], record),
    true
  )
})
